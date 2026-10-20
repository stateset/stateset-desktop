import { engineBaseUrl } from './computer-chat-bridge';
import type {
  DurableWorkflowIpcEvent,
  DurableWorkflowIpcMain,
  DurableWorkflowIpcSender,
} from './durable-workflow-ipc';

export interface DesktopServiceRequest {
  id: string;
  service: 'sandbox' | 'nsr';
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  scope?: { tenantId: string; brandId: string };
}
export interface DesktopServiceResponse {
  status: number;
  bodyText: string;
}
interface Configuration {
  baseUrl: string;
  apiKey: string;
}
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const ID = '[A-Za-z0-9_-]{1,128}';
const hasControl = (value: string) =>
  Array.from(value).some(
    (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159)
  );
const safeScope = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !hasControl(value);
const MAX_REQUEST = 2 * 1024 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;

function allowedPath(r: DesktopServiceRequest) {
  if (r.service === 'nsr')
    return r.method === 'POST' && ['/v1/decisions', '/v1/proofs/verify'].includes(r.path);
  if (r.method === 'GET')
    return (
      r.path === '/health' ||
      r.path === '/api/v1/agent/sessions/capabilities' ||
      new RegExp(`^/api/v1/agent/sessions/${ID}$`).test(r.path) ||
      new RegExp(`^/api(?:/v1)?/sandbox/${ID}(?:/status)?$`).test(r.path) ||
      new RegExp(`^/api/sandbox/${ID}/files\\?path=`).test(r.path)
    );
  if (r.method === 'DELETE') return new RegExp(`^/api/sandbox/${ID}$`).test(r.path);
  return (
    r.path === '/api/v1/agent/sessions' ||
    r.path === '/api/sandbox/create' ||
    new RegExp(`^/api/v1/agent/sessions/${ID}/(?:start|stop|exec|workspace/(?:read|list))$`).test(
      r.path
    ) ||
    new RegExp(`^/api/v1/sandbox/${ID}/(?:stop|inference)$`).test(r.path) ||
    new RegExp(`^/api/sandbox/${ID}/(?:stop|execute|files)$`).test(r.path)
  );
}
export function validateDesktopServiceRequest(value: unknown): DesktopServiceRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid desktop service request');
  const r = value as DesktopServiceRequest;
  if (
    typeof r.id !== 'string' ||
    !UUID.test(r.id) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(r.id) ||
    !['sandbox', 'nsr'].includes(r.service) ||
    !['GET', 'POST', 'DELETE'].includes(r.method) ||
    typeof r.path !== 'string' ||
    r.path.length > 4096 ||
    hasControl(r.path) ||
    r.path.includes('#') ||
    r.path.includes('\\') ||
    !allowedPath(r)
  )
    throw new Error('Desktop service request is outside the allowed API');
  if (typeof r.baseUrl !== 'string') throw new Error('Invalid desktop service endpoint');
  engineBaseUrl(r.baseUrl);
  if (!Number.isSafeInteger(r.timeoutMs) || r.timeoutMs < 1 || r.timeoutMs > 420_000)
    throw new Error('Invalid desktop service deadline');
  if (
    r.body !== undefined &&
    (typeof r.body !== 'string' ||
      Buffer.byteLength(r.body, 'utf8') > MAX_REQUEST ||
      r.method !== 'POST')
  )
    throw new Error('Invalid or oversized desktop service body');
  if (r.body !== undefined) {
    try {
      JSON.parse(r.body);
    } catch {
      throw new Error('Desktop service body must be JSON');
    }
  }
  if (
    r.scope !== undefined &&
    (!r.scope ||
      typeof r.scope !== 'object' ||
      Array.isArray(r.scope) ||
      !safeScope(r.scope.tenantId) ||
      !safeScope(r.scope.brandId))
  )
    throw new Error('Invalid desktop service scope');
  if (r.service === 'nsr' && !r.scope)
    throw new Error('NSR requests require the original organization and brand');
  if (!r.headers || typeof r.headers !== 'object' || Array.isArray(r.headers))
    throw new Error('Invalid desktop service headers');
  const permitted = new Set([
    'accept',
    'content-type',
    'idempotency-key',
    'x-api-key',
    ...(r.service === 'sandbox' ? ['authorization'] : ['x-org-id']),
  ]);
  const headers: Record<string, string> = {};
  for (const [name, v] of Object.entries(r.headers)) {
    const key = name.toLowerCase();
    if (
      !permitted.has(key) ||
      typeof v !== 'string' ||
      v.length > 8192 ||
      hasControl(v) ||
      key in headers
    )
      throw new Error('Desktop service header is not allowed');
    headers[key] = v;
  }
  if (headers['content-type'] && headers['content-type'] !== 'application/json')
    throw new Error('Desktop service requests must use JSON');
  if (r.path.includes('?')) {
    const url = new URL(r.path, 'https://desktop.invalid');
    const path = url.searchParams.get('path');
    if (
      r.method !== 'GET' ||
      !new RegExp(`^/api/sandbox/${ID}/files$`).test(url.pathname) ||
      [...url.searchParams.keys()].length !== 1 ||
      !path?.startsWith('/workspace/') ||
      path.split('/').includes('..') ||
      hasControl(path) ||
      path.includes('\\')
    )
      throw new Error('Invalid desktop workspace request');
  }
  return { ...r, id: r.id.toLowerCase(), headers };
}

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Desktop service request cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
export async function requestDesktopService(
  value: unknown,
  configuration: Configuration,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<DesktopServiceResponse> {
  const r = validateDesktopServiceRequest(value);
  const base = engineBaseUrl(configuration.baseUrl);
  if (engineBaseUrl(r.baseUrl) !== base)
    throw new Error('Desktop service endpoint changed. Restart the app before continuing.');
  if (r.service === 'sandbox') {
    const header = r.headers.authorization;
    const apiKeyHeader = r.headers['x-api-key'];
    const publicHealth = r.path === '/health' && header === undefined && apiKeyHeader === undefined;
    const authorized =
      configuration.apiKey &&
      ((apiKeyHeader === undefined &&
        [`ApiKey ${configuration.apiKey}`, `Bearer ${configuration.apiKey}`].includes(header)) ||
        (header === undefined && apiKeyHeader === configuration.apiKey));
    if (!publicHealth && !authorized)
      throw new Error('Sandbox connection changed. Retry with the current saved key.');
  } else if (
    !configuration.apiKey ||
    r.headers['x-api-key'] !== configuration.apiKey ||
    !safeScope(r.headers['x-org-id'])
  )
    throw new Error(
      'NSR connection changed. Save its key for this organization and brand before continuing.'
    );
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(r.timeoutMs)]);
  deadline.throwIfAborted();
  let response: Response;
  try {
    response = await abortable(
      fetcher(base + r.path, {
        method: r.method,
        headers: r.headers,
        body: r.body,
        redirect: 'error',
        credentials: 'omit',
        signal: deadline,
      }),
      deadline
    );
  } catch {
    if (deadline.aborted)
      throw new DOMException('Desktop service request cancelled or timed out', 'AbortError');
    throw new Error('Desktop service could not be reached');
  }
  if (!response.body) return { status: response.status, bodyText: '' };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await abortable(reader.read(), deadline);
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_RESPONSE) throw new Error('Desktop service response is too large');
      chunks.push(chunk.value);
    }
    deadline.throwIfAborted();
    return { status: response.status, bodyText: Buffer.concat(chunks).toString('utf8') };
  } catch {
    if (deadline.aborted)
      throw new DOMException('Desktop service request cancelled or timed out', 'AbortError');
    throw new Error(
      length > MAX_RESPONSE
        ? 'Desktop service response is too large'
        : 'Desktop service response could not be read'
    );
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

interface Owner {
  sender: DurableWorkflowIpcSender;
  active: Map<string, AbortController>;
  listeners: Map<string, (...args: unknown[]) => void>;
}
export function registerDesktopServiceIpc<Event extends DurableWorkflowIpcEvent>(options: {
  ipcMain: DurableWorkflowIpcMain<Event>;
  assertTrustedSender: (event: Event, channel: string) => void;
  getConfiguration: (request: DesktopServiceRequest) => Configuration;
  fetcher?: typeof fetch;
  maxActive?: number;
}) {
  const owners = new Map<DurableWorkflowIpcSender, Owner>();
  let disposed = false;
  const max = options.maxActive ?? 8;
  if (!Number.isSafeInteger(max) || max < 1 || max > 32)
    throw new Error('Invalid desktop service concurrency limit');
  const detach = (owner: Owner) => {
    if (owners.get(owner.sender) === owner) owners.delete(owner.sender);
    for (const [name, listener] of owner.listeners) owner.sender.removeListener(name, listener);
    owner.listeners.clear();
  };
  const abortOwner = (owner: Owner) => {
    detach(owner);
    for (const controller of owner.active.values()) controller.abort();
  };
  const trusted = (event: Event, channel: string) => {
    if (disposed) throw new Error('Desktop service transport is unavailable');
    options.assertTrustedSender(event, channel);
    if (event.sender.isDestroyed()) throw new Error('Desktop window is unavailable');
  };
  options.ipcMain.handle('service-api:request', async (event, value) => {
    trusted(event, 'service-api:request');
    const r = validateDesktopServiceRequest(value);
    let owner = owners.get(event.sender);
    if (owner?.active.has(r.id)) throw new Error('Desktop service request ID is already active');
    if (owner && owner.active.size >= max)
      throw new Error('Too many active desktop service requests');
    if (!owner) {
      owner = { sender: event.sender, active: new Map(), listeners: new Map() };
      const current = owner;
      const closed = () => abortOwner(current);
      owner.listeners.set('destroyed', closed);
      owner.listeners.set('render-process-gone', closed);
      owner.listeners.set('did-start-navigation', (...args) => {
        if (args[3] === true && args[2] === false) closed();
      });
      owners.set(event.sender, owner);
      for (const [name, listener] of owner.listeners) event.sender.on(name, listener);
    }
    const controller = new AbortController();
    owner.active.set(r.id, controller);
    try {
      const configuration = options.getConfiguration(r);
      const response = await requestDesktopService(
        r,
        configuration,
        controller.signal,
        options.fetcher
      );
      if (r.service === 'nsr') {
        const current = options.getConfiguration(r);
        if (current.baseUrl !== configuration.baseUrl || current.apiKey !== configuration.apiKey)
          throw new Error('NSR connection changed while checking the decision. Retry the check.');
      }
      // Sandbox mutations can allocate computers. Retain their acknowledgement
      // even after a key change so the runtime can persist identities for cleanup.
      return response;
    } finally {
      owner.active.delete(r.id);
      if (!owner.active.size) detach(owner);
    }
  });
  options.ipcMain.handle('service-api:cancel', (event, id) => {
    trusted(event, 'service-api:cancel');
    if (typeof id !== 'string' || !UUID.test(id))
      throw new Error('Invalid desktop service request ID');
    const controller = owners.get(event.sender)?.active.get(id.toLowerCase());
    if (!controller) return false;
    controller.abort();
    return true;
  });
  return {
    dispose() {
      disposed = true;
      for (const owner of [...owners.values()]) abortOwner(owner);
      options.ipcMain.removeHandler('service-api:request');
      options.ipcMain.removeHandler('service-api:cancel');
    },
  };
}
