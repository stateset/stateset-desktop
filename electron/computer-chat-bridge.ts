import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ComputerChatConnection {
  engineUrl: string;
  revision: string;
}

export interface ComputerChatRequest extends ComputerChatConnection {
  path: string;
  method: 'GET' | 'POST';
  tenantId: string;
  body?: unknown;
}
const ALLOWED_PATH =
  /^\/v1\/computer-chats\/(?:start|diagnostics|computer-chat-[a-f0-9]{32}-[a-f0-9]{32}\/(?:status|messages|review|workspace|artifact|control\/(?:pause|resume|retry|stop)))$/;

export function validateComputerChatRequest(value: unknown): ComputerChatRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid computer chat request');
  const request = value as ComputerChatRequest;
  if (
    !ALLOWED_PATH.test(request.path) ||
    !['GET', 'POST'].includes(request.method) ||
    typeof request.tenantId !== 'string' ||
    !request.tenantId ||
    request.tenantId.length > 100 ||
    /[\r\n]/.test(request.tenantId)
  )
    throw new Error('Computer chat request is outside the allowed API');
  if (JSON.stringify(request.body ?? null).length > 262144)
    throw new Error('Computer chat request is too large');
  if (
    typeof request.engineUrl !== 'string' ||
    typeof request.revision !== 'string' ||
    !request.revision
  )
    throw new Error('Reconnect the workflow connection before submitting this request');
  return request;
}

export function engineBaseUrl(value: string): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use HTTPS, or HTTP on localhost, for the workflow engine');
  return url.toString().replace(/\/+$/, '');
}

/** Opaque, process-local revisions never expose or persist credential fingerprints. */
export function createComputerChatConnection() {
  let previous: { url: string; apiKey: string } | undefined;
  let revision = randomUUID();
  return {
    invalidate: () => {
      previous = undefined;
      revision = randomUUID();
    },
    read: (configuration: { url: string; apiKey: string }): ComputerChatConnection => {
      const url = engineBaseUrl(configuration.url);
      if (previous && (previous.url !== url || previous.apiKey !== configuration.apiKey))
        revision = randomUUID();
      previous = { url, apiKey: configuration.apiKey };
      return { engineUrl: configuration.url.trim().replace(/\/+$/, ''), revision };
    },
  };
}

export class ComputerChatConnectionChangedError extends Error {
  constructor() {
    super('Workflow connection changed. Save and check the connection before trying again.');
    this.name = 'ComputerChatConnectionChangedError';
  }
}

export async function requestComputerChat(
  value: unknown,
  configuration: { url: string; apiKey: string; revision: string },
  fetcher: typeof fetch = fetch,
  isCurrent: () => boolean = () => true
) {
  const request = validateComputerChatRequest(value);
  const assertCurrent = () => {
    if (
      request.revision !== configuration.revision ||
      engineBaseUrl(request.engineUrl) !== engineBaseUrl(configuration.url) ||
      !isCurrent()
    )
      throw new ComputerChatConnectionChangedError();
  };
  assertCurrent();
  const url = `${engineBaseUrl(configuration.url)}${request.path}`;
  if (!configuration.apiKey.trim()) throw new Error('Save a workflow engine API key first');
  for (const scheme of ['Bearer', 'ApiKey']) {
    assertCurrent();
    const response = await fetcher(url, {
      method: request.method,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Accept: 'application/json',
        Authorization: `${scheme} ${configuration.apiKey}`,
        'Content-Type': 'application/json',
        'x-tenant-id': request.tenantId,
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    try {
      assertCurrent();
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      throw error;
    }
    if (response.status === 401 && scheme === 'Bearer') {
      await response.body?.cancel();
      continue;
    }
    if (!response.body) return { ok: response.ok, status: response.status, body: null };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        throw new Error('Computer chat response exceeded the size limit');
      }
      chunks.push(chunk.value);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { message: raw.slice(0, 1000) };
    }
    assertCurrent();
    return { ok: response.ok, status: response.status, body };
  }
  throw new Error('Workflow engine authentication failed');
}

export function decodeArtifact(value: unknown): { filename: string; bytes: Buffer } {
  if (!value || typeof value !== 'object') throw new Error('Invalid artifact export');
  const input = value as { filename?: unknown; contentBase64?: unknown; sha256?: unknown };
  if (
    typeof input.filename !== 'string' ||
    typeof input.contentBase64 !== 'string' ||
    typeof input.sha256 !== 'string' ||
    input.contentBase64.length > 180000 ||
    !/^[a-f0-9]{64}$/i.test(input.sha256)
  )
    throw new Error('Invalid artifact export');
  const filename = input.filename
    .replace(/[\\/<>:"|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/^\.+/, '')
    .slice(0, 160);
  if (!filename) throw new Error('Artifact needs a file name');
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (
    bytes.toString('base64') !== input.contentBase64 ||
    bytes.length > 131072 ||
    createHash('sha256').update(bytes).digest('hex') !== input.sha256.toLowerCase()
  )
    throw new Error('Artifact bytes do not match the recorded digest');
  return { filename, bytes };
}

/** Write beside the destination, then replace it only after the complete file is flushed. */
export async function writeArtifactFile(destination: string, bytes: Uint8Array) {
  const temporary = join(dirname(destination), `.stateset-${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    created = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, destination);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (created) await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}
