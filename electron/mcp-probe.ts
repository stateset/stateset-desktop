/**
 * Minimal MCP client used to verify a server before its credentials are saved.
 *
 * Speaks just enough of the streamable-HTTP transport to run the handshake
 * (`initialize` -> `notifications/initialized` -> `tools/list`) and report what
 * the server is and which tools it offers. Pure module: the caller injects
 * `fetch`, so it unit-tests without Electron or a network.
 */

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TOOL_NAMES = 50;
const MAX_REDIRECTS = 3;
/** A handshake reply is small; anything larger is not one, and must not be buffered. */
const MAX_BODY_BYTES = 1024 * 1024;
/** Server-controlled strings are displayed and persisted, so they are capped. */
const MAX_TEXT = 200;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** Strips brackets, lowercases, and drops the trailing dot of a fully-qualified name. */
function normalizeHost(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
}

/**
 * Addresses this probe refuses, so a compromised renderer cannot use the main
 * process to reach hosts it could never reach itself.
 *
 * Loopback counts as private here. The local-development allowance lives in
 * `parseEndpoint`, which knows it is looking at a literal the user typed —
 * this function is also applied to DNS results, where a name resolving to
 * loopback (`localtest.me`, `127.0.0.1.nip.io`) is exactly what must be caught.
 */
function isPrivateAddress(hostname: string): boolean {
  let host = normalizeHost(hostname);

  // `::ffff:10.0.0.1`, `::ffff:a00:1` and `::10.0.0.1` all carry an IPv4
  // address in their low 32 bits; the URL parser hands some of them over in
  // hex form, so unwrap them before the IPv4 test below.
  const embedded = /^::(?:ffff:)?([0-9a-f.:]+)$/.exec(host);
  if (embedded) {
    const rest = embedded[1];
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      host = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
    } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rest)) {
      host = rest;
    }
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true; // this host, private, loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0 && Number(ipv4[3]) === 0) return true; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, incl. Tailscale
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  // IPv6 loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10),
  // site-local (fec0::/10) and multicast (ff00::/8).
  if (host === '::' || host.startsWith('::1')) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  if (/^fe[c-f][0-9a-f]:/.test(host)) return true;
  if (/^ff[0-9a-f]{2}:/.test(host)) return true;

  return host.endsWith('.local') || host.endsWith('.internal');
}

export interface McpProbeRequest {
  endpoint: string;
  authToken?: string;
}

export interface McpProbeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  clientVersion?: string;
  /**
   * Resolves a hostname to its addresses. Supplied by the main process so a
   * name pointing at an internal address is refused as well as a literal one.
   */
  resolveHost?: (hostname: string) => Promise<string[]>;
  /**
   * Whether `localhost` endpoints are allowed. The main process enables this
   * only in development: in a packaged app it would hand the renderer a way to
   * reach every local service, which its own `connect-src` policy forbids.
   */
  allowLocalhost?: boolean;
}

export type McpProbeResult =
  | {
      ok: true;
      serverName: string;
      serverVersion: string;
      protocolVersion: string;
      toolCount: number;
      tools: string[];
    }
  | {
      ok: false;
      error: string;
      status?: number;
      /** The server was never reached, so nothing about it was disproved. */
      unreachable?: boolean;
    };

/** Reads at most `MAX_BODY_BYTES`, so a stream cannot exhaust the main process. */
async function readBounded(response: Response): Promise<string | null> {
  const body = response.body;
  if (!body) return await response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength ?? 0;
      if (bytes > MAX_BODY_BYTES) return null;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

/** Keeps a server-controlled string to a length that is safe to show and store. */
function cappedText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.slice(0, MAX_TEXT) : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface PostOutcome {
  ok: boolean;
  status: number;
  sessionId: string | null;
  contentType: string;
  text: string;
}

interface JsonRpcResponse {
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

function parseEndpoint(endpoint: string, allowLocalhost: boolean): URL | string {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    return 'MCP endpoint is not a valid URL.';
  }

  // Credentials in the URL are rejected outright: undici refuses to build a
  // request from one, and userinfo confuses origin comparisons.
  if (url.username || url.password) {
    return 'MCP endpoint must not contain credentials.';
  }

  const isLocal = allowLocalhost && LOCAL_HOSTNAMES.has(normalizeHost(url.hostname));

  if (url.protocol === 'https:') {
    if (!isLocal && isPrivateAddress(url.hostname)) {
      return 'MCP endpoints on private or internal addresses are not supported.';
    }
    return url;
  }
  if (url.protocol === 'http:') {
    return isLocal ? url : 'MCP endpoint must use https.';
  }
  return 'MCP endpoint is not a valid URL.';
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return 'Unauthorized — check the API key.';
  if (status === 404) return 'No MCP server at that endpoint.';
  if (status === 429) return 'The server is rate limiting this client.';
  if (status >= 500) return `The server returned an error (HTTP ${status}).`;
  return `The server rejected the request (HTTP ${status}).`;
}

/**
 * Reads the JSON-RPC reply to `expectedId` from either a plain JSON body or an
 * SSE-framed one. A stream may carry notifications, progress or ping frames
 * before the reply, so frames are matched on id rather than taking the first.
 */
function readRpcBody(
  text: string,
  contentType: string,
  expectedId: number
): JsonRpcResponse | null {
  if (!text.trim()) return null;

  if (contentType.toLowerCase().includes('text/event-stream')) {
    // One event may spread its payload over several `data:` lines, which the
    // spec says to join with newlines — a server pretty-printing its JSON does.
    for (const event of text.split(/\r?\n\r?\n/)) {
      const payload = event
        .split(/\r?\n/)
        .filter((line) => line.trimStart().startsWith('data:'))
        .map((line) => line.trimStart().slice(5).trim())
        .join('\n');
      if (!payload) continue;
      try {
        const frame = JSON.parse(payload) as JsonRpcResponse;
        // Ids may legally be strings, and a stream can carry server-initiated
        // requests that share an id but are not replies to ours.
        const isReply = 'result' in frame || 'error' in frame;
        if (isReply && String(frame.id) === String(expectedId)) return frame;
      } catch {
        // Keep scanning: a stream may carry comments or partial frames.
      }
    }
    return null;
  }

  try {
    const body = JSON.parse(text) as JsonRpcResponse;
    if (!isPlainObject(body)) return null;
    // A reply carrying someone else's id is not an answer to this request.
    if (body.id !== undefined && String(body.id) !== String(expectedId)) return null;
    return body;
  } catch {
    return null;
  }
}

function toolNames(result: Record<string, unknown> | undefined): string[] {
  const tools = Array.isArray(result?.tools) ? (result.tools as { name?: unknown }[]) : [];
  return tools
    .map((tool) => (typeof tool?.name === 'string' ? tool.name.slice(0, MAX_TEXT) : ''))
    .filter(Boolean);
}

export async function probeMcpServer(
  request: McpProbeRequest,
  options: McpProbeOptions = {}
): Promise<McpProbeResult> {
  const allowLocalhost = options.allowLocalhost ?? false;
  const parsed = parseEndpoint(request.endpoint ?? '', allowLocalhost);
  if (typeof parsed === 'string') {
    // Nothing was contacted, so this says nothing about the server itself.
    return { ok: false, error: parsed, unreachable: true };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost;

  /**
   * Refuses a host whose name resolves into a private range. Fails closed: if
   * the answer is unknown the endpoint is not probed, matching how every other
   * check here treats an address it cannot vouch for.
   */
  const checkResolution = async (url: URL): Promise<string | null> => {
    const host = normalizeHost(url.hostname);
    if (!resolveHost || (allowLocalhost && LOCAL_HOSTNAMES.has(host))) return null;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return 'The server did not respond in time.';

    try {
      const addresses = await Promise.race([
        resolveHost(host),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('resolve timeout')), remaining)
        ),
      ]);
      return addresses.some((address) => isPrivateAddress(address))
        ? 'MCP endpoints on private or internal addresses are not supported.'
        : null;
    } catch {
      return 'Could not resolve the address of that server.';
    }
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // One budget for the whole handshake: three requests, each of which may
  // redirect, must not add up to minutes of a spinning button.
  const deadline = Date.now() + timeoutMs;
  const token = request.authToken?.trim();
  let sessionId: string | null = null;

  // Redirects are followed by hand, and only within the configured origin, so a
  // 302 can never carry the token to another host or to plain http.
  let target = parsed;

  const origin = parsed.origin;

  // Budget for the whole probe, not per message: three requests that each
  // redirect must not add up to a dozen.
  let redirectsLeft = MAX_REDIRECTS;

  const post = async (payload: Record<string, unknown>): Promise<PostOutcome | string> => {
    const body = JSON.stringify(payload);

    for (;;) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL_VERSION,
      };
      if (token) headers.authorization = `Bearer ${token}`;
      if (sessionId) headers['mcp-session-id'] = sessionId;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return 'The server did not respond in time.';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await doFetch(target.toString(), {
          method: 'POST',
          headers,
          body,
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status < 300 || response.status > 399) {
          // Read the body while the timeout is still armed: an MCP server may
          // hold an SSE stream open indefinitely.
          const text = await readBounded(response);
          if (text === null) return 'The server sent more data than a handshake should.';
          return {
            ok: response.ok,
            status: response.status,
            sessionId: response.headers.get('mcp-session-id'),
            contentType: response.headers.get('content-type') ?? '',
            text,
          };
        }

        const location = response.headers.get('location');
        if (!location) {
          return {
            ok: false,
            status: response.status,
            sessionId: null,
            contentType: '',
            text: '',
          };
        }

        const next = parseEndpoint(new URL(location, target).toString(), allowLocalhost);
        if (typeof next === 'string') {
          return 'The server redirected to an address that is not https.';
        }
        // Same-origin only: following a redirect elsewhere would either leak the
        // token or need it stripped, and an MCP endpoint that moves host is a
        // configuration change the user should make themselves. Staying on the
        // origin also means the resolution check above still applies.
        if (next.origin !== origin) {
          return 'The server redirected to a different host. Point at that address instead.';
        }
        if (redirectsLeft === 0) return 'The server redirected too many times.';
        redirectsLeft -= 1;
        target = next;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  try {
    const resolutionError = await checkResolution(parsed);
    if (resolutionError) return { ok: false, error: resolutionError, unreachable: true };

    const initResponse = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'stateset-desktop', version: options.clientVersion ?? '0.0.0' },
      },
    });
    // These refusals are about reaching the server, not about what it said.
    if (typeof initResponse === 'string') {
      return { ok: false, error: initResponse, unreachable: true };
    }

    if (!initResponse.ok) {
      return { ok: false, status: initResponse.status, error: statusMessage(initResponse.status) };
    }
    sessionId = initResponse.sessionId;

    const initBody = readRpcBody(initResponse.text, initResponse.contentType, 1);
    if (initBody?.error) {
      return {
        ok: false,
        error: cappedText(initBody.error.message, 'The server rejected the handshake.'),
      };
    }
    if (!isPlainObject(initBody?.result)) {
      return { ok: false, error: 'The server did not return a valid MCP handshake.' };
    }

    const serverInfo = isPlainObject(initBody.result.serverInfo) ? initBody.result.serverInfo : {};

    // Part of the handshake: a failure here means the session is not usable,
    // so it must not be swallowed on the way to reporting success.
    const notified = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    if (typeof notified === 'string') return { ok: false, error: notified, unreachable: true };
    if (!notified.ok) {
      return { ok: false, status: notified.status, error: statusMessage(notified.status) };
    }
    if (notified.sessionId) sessionId = notified.sessionId;

    const toolsResponse = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    if (typeof toolsResponse === 'string') {
      return { ok: false, error: toolsResponse, unreachable: true };
    }
    if (!toolsResponse.ok) {
      return {
        ok: false,
        status: toolsResponse.status,
        error: statusMessage(toolsResponse.status),
      };
    }
    const toolsBody = readRpcBody(toolsResponse.text, toolsResponse.contentType, 2);
    if (toolsBody?.error) {
      return {
        ok: false,
        error: cappedText(toolsBody.error.message, 'The server could not list its tools.'),
      };
    }
    if (!isPlainObject(toolsBody?.result)) {
      // Without a valid reply this is not a working server, and reporting
      // "0 tools" would record a success that never happened.
      return { ok: false, error: 'The server did not return a valid tool list.' };
    }

    const names = toolNames(toolsBody.result);
    return {
      ok: true,
      // Server-controlled: type-checked and capped before it is shown or stored.
      serverName: cappedText(serverInfo.name, target.hostname),
      serverVersion: cappedText(serverInfo.version, 'unknown'),
      protocolVersion: cappedText(initBody.result.protocolVersion, PROTOCOL_VERSION),
      toolCount: names.length,
      tools: names.slice(0, MAX_TOOL_NAMES),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'The server did not respond in time.', unreachable: true };
    }
    return { ok: false, error: 'Could not reach the server.', unreachable: true };
  }
}
