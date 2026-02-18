import * as crypto from 'crypto';
import {
  OAuthConfig,
  OAuthError,
  createOAuthServer,
  openOAuthWindow,
  getSuccessHtml,
  getErrorHtml,
  getQueryValue,
  isValidSubdomain,
} from './utils';

export interface ZendeskCredentials {
  subdomain: string;
  api_token: string;
  email: string;
}

export interface ZendeskOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

const PROVIDER = 'Zendesk';
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_PATH = '/callback';

export class ZendeskOAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectPort: number = 8236;

  private static readonly MAX_CODE_LENGTH = 2048;

  constructor(credentials: ZendeskOAuthCredentials) {
    this.clientId = credentials.clientId || '';
    this.clientSecret = credentials.clientSecret || '';
  }

  async startAuth(subdomain: string): Promise<ZendeskCredentials> {
    return new Promise((resolve, reject) => {
      if (!this.clientId || !this.clientSecret) {
        reject(
          new OAuthError(
            'Zendesk OAuth credentials are not configured.',
            'NOT_CONFIGURED',
            PROVIDER
          )
        );
        return;
      }

      const state = crypto.randomBytes(16).toString('hex');

      // Normalize subdomain
      const zendeskSubdomain = subdomain.replace('.zendesk.com', '').replace(/^https?:\/\//, '');
      if (!isValidSubdomain(zendeskSubdomain)) {
        reject(
          new OAuthError(
            'Zendesk subdomain must be a valid subdomain (e.g., your-company).',
            'INVALID_DOMAIN',
            PROVIDER
          )
        );
        return;
      }

      const callbackUri = `http://localhost:${this.redirectPort}${CALLBACK_PATH}`;
      // Build authorization URL
      const authUrl = new URL(`https://${zendeskSubdomain}.zendesk.com/oauth/authorizations/new`);
      authUrl.searchParams.set('client_id', this.clientId);
      authUrl.searchParams.set('redirect_uri', callbackUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set(
        'scope',
        'read write tickets:read tickets:write users:read users:write'
      );

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

      const succeed = (credentials: ZendeskCredentials) => {
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

            const codeValue = getQueryValue(query, 'code');
            const returnedState = getQueryValue(query, 'state');
            const errorParam = getQueryValue(query, 'error');

            if (codeValue && codeValue.length > ZendeskOAuth.MAX_CODE_LENGTH) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Authorization code is invalid.'));
              fail(new OAuthError('Authorization code is invalid', 'MISSING_CODE', PROVIDER));
              return;
            }

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

            if (!codeValue) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(getErrorHtml(PROVIDER, 'Authorization was not completed.'));
              fail(new OAuthError('Missing authorization code', 'MISSING_CODE', PROVIDER));
              return;
            }

            try {
              const tokenResponse = await fetch(
                `https://${zendeskSubdomain}.zendesk.com/oauth/tokens`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code: codeValue,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: callbackUri,
                    scope: 'read write',
                  }),
                }
              );

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
                token_type: string;
              };

              if (!tokenData.access_token) {
                fail(new OAuthError('No access token in response', 'INVALID_RESPONSE', PROVIDER));
                return;
              }

              // Get user info to get email
              const userResponse = await fetch(
                `https://${zendeskSubdomain}.zendesk.com/api/v2/users/me.json`,
                {
                  headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                  },
                }
              );

              let email = '';
              if (userResponse.ok) {
                const userData = (await userResponse.json()) as { user: { email: string } };
                email = userData.user?.email || '';
              }

              // Success response
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(getSuccessHtml(PROVIDER));

              succeed({
                subdomain: zendeskSubdomain,
                api_token: tokenData.access_token,
                email,
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
          server.on('close', () => {
            if (!settled && userCancelled) {
              fail(new OAuthError('Connection was cancelled', 'USER_CANCELLED', PROVIDER));
            }
          });

          authWindow = openOAuthWindow(authUrl.toString(), oauthConfig, () => {
            if (settled) {
              return;
            }
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
