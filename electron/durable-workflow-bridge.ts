import { ComputerChatConnectionChangedError, engineBaseUrl } from './computer-chat-bridge';

interface WorkflowConnection {
  engineUrl: string;
  revision: string;
}
export interface DurableWorkflowRequest extends WorkflowConnection {
  id: string;
  tenantId: string;
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}
export interface DurableWorkflowStreamRequest extends WorkflowConnection {
  id: string;
  tenantId: string;
  workflowId: string;
  lastEventId?: number;
}
export interface DurableWorkflowResponse {
  ok: boolean;
  status: number;
  body: unknown;
}
export interface DurableWorkflowEvent {
  event_id: number;
  kind: string;
  ts: string;
  activity?: string;
  attempt?: number;
  signal?: string;
  preview?: string;
  error?: string;
}
interface Configuration {
  url: string;
  apiKey: string;
  revision: string;
}
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_FRAME_BYTES = 256 * 1024;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const hasControl = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
const ACTIONS = new Set([
  'pause',
  'resume',
  'cancel',
  'terminate',
  'steer',
  'reprioritize',
  'extend-budget',
  'enqueue',
]);

function safeWorkflowId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') <= 1024 &&
    value !== '.' &&
    value !== '..' &&
    !hasControl(value) &&
    !/[\\/%?#]/.test(value)
  );
}
function safeEncodedWorkflowId(value: string): boolean {
  if (!/^(?:[A-Za-z0-9_.!~*'()-]|%[\da-f]{2})+$/i.test(value)) return false;
  try {
    return safeWorkflowId(decodeURIComponent(value));
  } catch {
    return false;
  }
}
function validateConnection(value: unknown): WorkflowConnection & { id: string; tenantId: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid durable workflow request');
  const request = value as DurableWorkflowRequest;
  if (
    typeof request.id !== 'string' ||
    !UUID.test(request.id) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(request.id)
  )
    throw new Error('Durable workflow request ID must be a non-nil UUID');
  if (
    typeof request.tenantId !== 'string' ||
    !request.tenantId.trim() ||
    request.tenantId.length > 100 ||
    /[^\x20-\x7e]/.test(request.tenantId)
  )
    throw new Error('Durable workflow tenant must be a nonempty safe header value');
  if (
    typeof request.engineUrl !== 'string' ||
    request.engineUrl.length > 2048 ||
    hasControl(request.engineUrl) ||
    typeof request.revision !== 'string' ||
    !request.revision ||
    request.revision.length > 512 ||
    hasControl(request.revision)
  )
    throw new Error('Reconnect the workflow connection before submitting this request');
  engineBaseUrl(request.engineUrl);
  return {
    id: request.id,
    tenantId: request.tenantId,
    engineUrl: request.engineUrl,
    revision: request.revision,
  };
}
function jsonBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(body);
  } catch {
    throw new Error('Durable workflow body must be serializable JSON');
  }
  if (serialized === undefined) throw new Error('Durable workflow body must be serializable JSON');
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES)
    throw new Error('Durable workflow request exceeds 2 MiB');
  return serialized;
}
export function validateDurableWorkflowRequest(value: unknown): DurableWorkflowRequest {
  const connection = validateConnection(value);
  const request = value as DurableWorkflowRequest;
  let allowed = request.method === 'GET' && request.path === '/health';
  if (
    request.method === 'POST' &&
    ['/v1/workflows/active-horizon-agent/start', '/v1/workflows/connector/start'].includes(
      request.path
    )
  )
    allowed = true;
  if (typeof request.path === 'string') {
    const match = /^\/v1\/workflows\/active-horizon-agent\/([^/]+)\/([^/]+)$/.exec(request.path);
    if (match && safeEncodedWorkflowId(match[1]))
      allowed =
        (request.method === 'GET' && match[2] === 'status') ||
        (request.method === 'POST' && ACTIONS.has(match[2]));
    const connector = /^\/v1\/workflows\/connector\/([^/]+)\/([^/]+)$/.exec(request.path);
    if (connector && safeEncodedWorkflowId(connector[1]))
      allowed =
        (request.method === 'GET' && connector[2] === 'status') ||
        (request.method === 'POST' && connector[2] === 'cancel');
  }
  if (!allowed || (request.method === 'GET' && request.body !== undefined))
    throw new Error('Durable workflow request is outside the allowed API');
  const serialized = jsonBody(request.body);
  return {
    ...connection,
    path: request.path,
    method: request.method,
    ...(serialized === undefined ? {} : { body: JSON.parse(serialized) }),
  };
}
export function validateDurableWorkflowStreamRequest(value: unknown): DurableWorkflowStreamRequest {
  const connection = validateConnection(value);
  const request = value as DurableWorkflowStreamRequest;
  if (!safeWorkflowId(request.workflowId)) throw new Error('Invalid durable workflow stream ID');
  if (
    request.lastEventId !== undefined &&
    (!Number.isSafeInteger(request.lastEventId) || request.lastEventId < 0)
  )
    throw new Error('Last event ID must be a nonnegative safe integer');
  return {
    ...connection,
    workflowId: request.workflowId,
    ...(request.lastEventId === undefined ? {} : { lastEventId: request.lastEventId }),
  };
}

function context(request: WorkflowConnection, configuration: Configuration, signal: AbortSignal) {
  const configured = { ...configuration };
  const base = engineBaseUrl(configured.url);
  if (!configured.apiKey.trim() || /[^\x20-\x7e]/.test(configured.apiKey))
    throw new Error('Save a valid workflow engine API key first');
  return {
    base,
    key: configured.apiKey.trim(),
    assertCurrent(isCurrent: () => boolean) {
      signal.throwIfAborted();
      if (
        request.revision !== configured.revision ||
        engineBaseUrl(request.engineUrl) !== base ||
        !isCurrent()
      )
        throw new ComputerChatConnectionChangedError();
    },
  };
}
function aborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}
async function cancelBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}
async function fetchResponse(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal
) {
  const fetching = fetcher(url, init);
  try {
    return await aborted(fetching, signal);
  } catch (error) {
    void fetching.then(cancelBody, () => undefined);
    throw error;
  }
}
async function readBody(
  response: Response,
  signal: AbortSignal,
  assertCurrent: () => void
): Promise<string> {
  if (!response.body) {
    assertCurrent();
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      assertCurrent();
      const chunk = await aborted(reader.read(), signal);
      assertCurrent();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error('Durable workflow response exceeds 2 MiB');
      chunks.push(chunk.value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
function parseResponse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
}

export async function requestDurableWorkflow(
  value: unknown,
  configuration: Configuration,
  fetcher: typeof fetch = fetch,
  isCurrent: () => boolean = () => true,
  signal?: AbortSignal
): Promise<DurableWorkflowResponse> {
  const request = validateDurableWorkflowRequest(value);
  const timeout = AbortSignal.timeout(60_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const connection = context(request, configuration, requestSignal);
  const assertCurrent = () => connection.assertCurrent(isCurrent);
  const body = jsonBody(request.body);
  for (const scheme of ['Bearer', 'ApiKey']) {
    assertCurrent();
    const response = await fetchResponse(
      fetcher,
      `${connection.base}${request.path}`,
      {
        method: request.method,
        redirect: 'error',
        signal: requestSignal,
        headers: {
          Accept: 'application/json',
          Authorization: `${scheme} ${connection.key}`,
          'Content-Type': 'application/json',
          'x-tenant-id': request.tenantId,
        },
        body,
      },
      requestSignal
    );
    try {
      assertCurrent();
    } catch (error) {
      await cancelBody(response);
      throw error;
    }
    if (response.status === 401 && scheme === 'Bearer') {
      await cancelBody(response);
      continue;
    }
    const raw = await readBody(response, requestSignal, assertCurrent);
    assertCurrent();
    return { ok: response.ok, status: response.status, body: parseResponse(raw) };
  }
  throw new Error('Durable workflow authentication failed');
}

function parseEvent(frame: string): DurableWorkflowEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');
  if (!data) return null;
  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    return null;
  }
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  if (record.kind === 'stream_error')
    throw new Error(
      typeof record.error === 'string' ? record.error : 'The workflow event stream stopped.'
    );
  if (
    !Number.isSafeInteger(record.event_id) ||
    typeof record.kind !== 'string' ||
    typeof record.ts !== 'string'
  )
    return null;
  return record as unknown as DurableWorkflowEvent;
}
export async function streamDurableWorkflowEvents(
  value: unknown,
  configuration: Configuration,
  onEvent: (event: DurableWorkflowEvent) => void,
  fetcher: typeof fetch = fetch,
  isCurrent: () => boolean = () => true,
  signal?: AbortSignal
): Promise<void> {
  const request = validateDurableWorkflowStreamRequest(value);
  const requestSignal = signal ?? new AbortController().signal;
  const connection = context(request, configuration, requestSignal);
  const assertCurrent = () => connection.assertCurrent(isCurrent);
  for (const scheme of ['Bearer', 'ApiKey']) {
    assertCurrent();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `${scheme} ${connection.key}`,
      'x-tenant-id': request.tenantId,
    };
    if (request.lastEventId !== undefined && request.lastEventId > 0)
      headers['Last-Event-ID'] = String(request.lastEventId);
    const response = await fetchResponse(
      fetcher,
      `${connection.base}/v1/workflows/${encodeURIComponent(request.workflowId)}/events`,
      { method: 'GET', redirect: 'error', headers, signal: requestSignal },
      requestSignal
    );
    try {
      assertCurrent();
    } catch (error) {
      await cancelBody(response);
      throw error;
    }
    if (response.status === 401 && scheme === 'Bearer') {
      await cancelBody(response);
      continue;
    }
    if (!response.ok) {
      const raw = await readBody(response, requestSignal, assertCurrent);
      throw Object.assign(
        new Error(raw.slice(0, 1000) || `Workflow event stream returned ${response.status}`),
        { status: response.status }
      );
    }
    if (
      !/^text\/event-stream(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') ||
      !response.body
    ) {
      await cancelBody(response);
      throw new Error('Workflow endpoint did not return an event stream');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '';
    const emit = (frame: string) => {
      if (Buffer.byteLength(frame, 'utf8') > MAX_FRAME_BYTES)
        throw new Error('Durable workflow event frame exceeds 256 KiB');
      const event = parseEvent(frame);
      if (event) {
        assertCurrent();
        onEvent(event);
        assertCurrent();
      }
    };
    try {
      for (;;) {
        assertCurrent();
        const chunk = await aborted(reader.read(), requestSignal);
        assertCurrent();
        if (chunk.value && chunk.value.byteLength > MAX_BODY_BYTES)
          throw new Error('Durable workflow event chunk exceeds 2 MiB');
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          emit(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
        if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES)
          throw new Error('Durable workflow event frame exceeds 256 KiB');
        if (chunk.done) {
          emit(buffer);
          return;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  throw new Error('Durable workflow authentication failed');
}
