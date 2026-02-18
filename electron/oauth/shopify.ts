import * as crypto from 'crypto';
import {
  OAuthConfig,
  OAuthError,
  createOAuthServer,
  openOAuthWindow,
  getSuccessHtml,
  getErrorHtml,
  getQueryValue,
} from './utils';

export interface ShopifyCredentials {
  shop_domain: string;
  access_token: string;
  scope: string;
}

export interface ShopifyOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const PROVIDER = 'Shopify';
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_PATH = '/callback';

function normalizeShopDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function verifyShopifyHmac(
  query: Record<string, string | string[] | undefined>,
  clientSecret: string
): boolean {
  const hmac = getQueryValue(query, 'hmac');
  if (!hmac || !clientSecret) {
    return false;
  }

  const message = Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => {
      const value = getQueryValue(query, key) ?? '';
      return `${key}=${value}`;
    })
    .join('&');

  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch {
    return false;
  }
}

export class ShopifyOAuth {
  private clientId: string;
  private clientSecret: string;
  private scopes: string[];
  private redirectPort: number = 8234;

  private static readonly MAX_CODE_LENGTH = 2048;

  constructor(credentials: ShopifyOAuthCredentials) {
    this.clientId = credentials.clientId || '';
    this.clientSecret = credentials.clientSecret || '';
    this.scopes = [
      'read_orders',
      'write_orders',
      'read_customers',
      'write_customers',
      'read_products',
      'read_fulfillments',
      'write_fulfillments',
    ];
  }

  async startAuth(shop: string): Promise<ShopifyCredentials> {
    return new Promise((resolve, reject) => {
      if (!this.clientId || !this.clientSecret) {
        reject(
          new OAuthError(
            'Shopify OAuth credentials are not configured.',
            'NOT_CONFIGURED',
            PROVIDER
          )
        );
        return;
      }

      const state = crypto.randomBytes(16).toString('hex');

      // Normalize shop domain
      const shopDomain = normalizeShopDomain(shop);
      if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
        reject(
          new OAuthError(
            'Shop domain must be a valid myshopify.com domain (e.g., your-store.myshopify.com).',
            'INVALID_DOMAIN',
            PROVIDER
          )
        );
        return;
      }

      // Build authorization URL
      const callbackUri = `http://localhost:${this.redirectPort}${CALLBACK_PATH}`;
      const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
      authUrl.searchParams.set('client_id', this.clientId);
      authUrl.searchParams.set('scope', this.scopes.join(','));
      authUrl.searchParams.set('redirect_uri', callbackUri);
      authUrl.searchParams.set('state', state);

      let authWindow: ReturnType<typeof openOAuthWindow> | null = null;
      let serverCleanup: (() => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      let userCancelled = false;
      let settled = false;

      const fail = (error: Error | OAuthError) => {
        if (settled) {
          return;
        }

        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        authWindow?.close();
        serverCleanup?.();
        reject(
          error instanceof OAuthError
            ? error
            : new OAuthError(
                `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'TOKEN_EXCHANGE_FAILED',
                PROVIDER,
                error instanceof Error ? error : undefined
              )
        );
      };

      const succeed = (credentials: ShopifyCredentials) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        authWindow?.close();
        serverCleanup?.();
        resolve(credentials);
      };

      const oauthConfig: OAuthConfig = {
        provider: PROVIDER,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectPort: this.redirectPort,
        timeoutMs: CALLBACK_TIMEOUT_MS,
        callbackPath: CALLBACK_PATH,
        windowOptions: {
          width: 600,
          height: 700,
          autoHideMenuBar: true,
          title: `Sign in to ${PROVIDER}`,
        },
      };

      void (async () => {
        try {
          const { server, cleanup } = await createOAuthServer(oauthConfig, async (query, res) => {
            if (settled) {
              return;
            }

            const code = getQueryValue(query, 'code');
            if (code && code.length > ShopifyOAuth.MAX_CODE_LENGTH) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Authorization code is invalid.'));
              fail(new OAuthError('Authorization code is invalid', 'MISSING_CODE', PROVIDER));
              return;
            }

            const returnedState = getQueryValue(query, 'state');
            const returnedShop = getQueryValue(query, 'shop');
            const errorParam = getQueryValue(query, 'error');

            if (errorParam === 'access_denied') {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'You declined to authorize the connection.'));
              fail(new OAuthError('User declined authorization', 'USER_CANCELLED', PROVIDER));
              return;
            }

            if (returnedState !== state) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Security validation failed. Please try again.'));
              fail(
                new OAuthError('State mismatch - possible CSRF attack', 'STATE_MISMATCH', PROVIDER)
              );
              return;
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Authorization was not completed.'));
              fail(new OAuthError('Missing authorization code', 'MISSING_CODE', PROVIDER));
              return;
            }

            if (returnedShop && normalizeShopDomain(returnedShop) !== shopDomain) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Shop domain mismatch detected.'));
              fail(new OAuthError('Shop mismatch', 'INVALID_DOMAIN', PROVIDER));
              return;
            }

            if (!verifyShopifyHmac(query, this.clientSecret)) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Security signature validation failed.'));
              fail(new OAuthError('Invalid HMAC signature', 'INVALID_RESPONSE', PROVIDER));
              return;
            }

            try {
              // Exchange code for access token
              const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  client_id: this.clientId,
                  client_secret: this.clientSecret,
                  code,
                }),
              });

              if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text().catch(() => 'Unknown error');
                fail(
                  new OAuthError(
                    `Token exchange failed: ${tokenResponse.status} - ${errorText}`,
                    'TOKEN_EXCHANGE_FAILED',
                    PROVIDER
                  )
                );
                return;
              }

              const tokenData = (await tokenResponse.json()) as {
                access_token: string;
                scope: string;
              };

              if (!tokenData.access_token) {
                fail(new OAuthError('No access token in response', 'INVALID_RESPONSE', PROVIDER));
                return;
              }

              // Success response
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(getSuccessHtml(PROVIDER));

              succeed({
                shop_domain: shopDomain,
                access_token: tokenData.access_token,
                scope: tokenData.scope,
              });
            } catch (error) {
              const oauthError =
                error instanceof OAuthError
                  ? error
                  : new OAuthError(
                      `Authentication failed: ${
                        error instanceof Error ? error.message : 'Unknown error'
                      }`,
                      'TOKEN_EXCHANGE_FAILED',
                      PROVIDER,
                      error instanceof Error ? error : undefined
                    );
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, oauthError.message));
              fail(oauthError);
            }
          });

          serverCleanup = cleanup;
          authWindow = openOAuthWindow(authUrl.toString(), oauthConfig, () => {
            if (settled) return;
            userCancelled = true;
            serverCleanup?.();
          });

          timeoutId = setTimeout(() => {
            fail(
              new OAuthError(
                'Connection timed out after 5 minutes. Please try again.',
                'TIMEOUT',
                PROVIDER
              )
            );
          }, CALLBACK_TIMEOUT_MS);

          server.on('close', () => {
            if (!settled && userCancelled) {
              fail(new OAuthError('Connection was cancelled', 'USER_CANCELLED', PROVIDER));
            }
          });
        } catch (error) {
          fail(
            error instanceof OAuthError
              ? error
              : new OAuthError(
                  `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  'NETWORK_ERROR',
                  PROVIDER,
                  error instanceof Error ? error : undefined
                )
          );
        }
      })();
    });
  }
}
