import type { DesktopServiceRequest } from '../../electron/service-api-bridge';

/** Native API calls avoid browser preflights while retaining the saved connection boundary. */
export async function desktopServiceFetch(
  service: DesktopServiceRequest['service'],
  baseUrl: string,
  path: string,
  init: RequestInit,
  options: { timeoutMs: number; scope?: DesktopServiceRequest['scope'] }
): Promise<Response> {
  const native = typeof window !== 'undefined' ? window.electronAPI?.serviceApi : undefined;
  if (!native) return fetch(`${baseUrl}${path}`, init);
  init.signal?.throwIfAborted();
  if (init.body != null && typeof init.body !== 'string')
    throw new Error('Desktop service requests require a JSON body.');
  const id = crypto.randomUUID();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      void native.cancel(id).catch(() => undefined);
      reject(new DOMException('Desktop service request cancelled', 'AbortError'));
    };
    init.signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const result = await Promise.race([
      native.request({
        id,
        service,
        baseUrl,
        path,
        method: (init.method ?? 'GET').toUpperCase() as DesktopServiceRequest['method'],
        headers,
        body: init.body ?? undefined,
        timeoutMs: options.timeoutMs,
        scope: options.scope,
      }),
      cancelled,
    ]);
    init.signal?.throwIfAborted();
    return new Response([204, 205, 304].includes(result.status) ? null : result.bodyText, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    if (abort) init.signal?.removeEventListener('abort', abort);
  }
}
