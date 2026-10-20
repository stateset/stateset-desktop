import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerDurableWorkflowIpc,
  type DurableWorkflowIpcEvent,
  type DurableWorkflowIpcRegistration,
} from './durable-workflow-ipc';

const REQUEST = 'durable-workflows:request';
const STREAM = 'durable-workflows:stream';
const CANCEL = 'durable-workflows:cancel';
const EVENT = 'durable-workflows:event';
const configuration = {
  url: 'https://custom.engine.example/base',
  apiKey: 'native-secret',
  revision: 'revision-one',
};
const id = (value = 1) => `11111111-1111-4111-8111-${String(value).padStart(12, '0')}`;
const request = (value = 1) => ({
  id: id(value),
  engineUrl: configuration.url,
  revision: configuration.revision,
  tenantId: 'tenant-one',
  method: 'GET',
  path: '/health',
});
const streamRequest = (value = 1) => ({ ...request(value), workflowId: 'legacy workflow:one' });
const event = { event_id: 1, kind: 'activity_completed', ts: '2026-10-17T12:00:00Z' };

class Sender extends EventEmitter {
  destroyed = false;
  send = vi.fn((_channel: string, ..._args: unknown[]) => undefined);
  constructor(readonly id = 1) {
    super();
  }
  isDestroyed() {
    return this.destroyed;
  }
}

interface InvokeEvent extends DurableWorkflowIpcEvent {
  sender: Sender;
  trusted: boolean;
}

class Ipc {
  handlers = new Map<string, (event: InvokeEvent, ...args: unknown[]) => unknown>();
  handle(channel: string, listener: (event: InvokeEvent, ...args: unknown[]) => unknown) {
    if (this.handlers.has(channel)) throw new Error('Handler already registered');
    this.handlers.set(channel, listener);
  }
  removeHandler = vi.fn((channel: string) => {
    this.handlers.delete(channel);
  });
  async invoke(sender: Sender, channel: string, value: unknown, trusted = true) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error('Missing handler');
    return await handler({ sender, trusted }, value);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function heldBody(contentType = 'application/json') {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  return {
    body,
    cancel,
    controller,
    response: new Response(body, { headers: { 'content-type': contentType } }),
    emit() {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    },
  };
}

const registrations: DurableWorkflowIpcRegistration[] = [];
afterEach(() => {
  registrations.splice(0).forEach((registration) => registration.dispose());
});

function setup(fetcher: typeof fetch, maxActivePerOwner?: number) {
  const ipcMain = new Ipc();
  const connection = { ...configuration };
  const getConnection = vi.fn(() => ({ ...connection }));
  const assertTrustedSender = vi.fn((event: InvokeEvent) => {
    if (!event.trusted) throw new Error('Untrusted sender');
  });
  const registration = registerDurableWorkflowIpc({
    ipcMain,
    assertTrustedSender,
    getConnection,
    fetcher,
    maxActivePerOwner,
  });
  registrations.push(registration);
  return { ipcMain, connection, getConnection, assertTrustedSender, registration };
}

function observe(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error })
  );
}

function expectDetached(sender: Sender) {
  expect(sender.listenerCount('destroyed')).toBe(0);
  expect(sender.listenerCount('render-process-gone')).toBe(0);
  expect(sender.listenerCount('did-start-navigation')).toBe(0);
}

describe('durable workflow IPC admission and ownership', () => {
  it.each([REQUEST, STREAM, CANCEL])(
    'rejects untrusted %s before native access',
    async (channel) => {
      const fetcher = vi.fn();
      const { ipcMain, getConnection } = setup(fetcher);
      const sender = new Sender();
      await expect(
        ipcMain.invoke(sender, channel, channel === CANCEL ? id() : request(), false)
      ).rejects.toThrow('Untrusted sender');
      expect(getConnection).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expectDetached(sender);
    }
  );

  it('rejects malformed requests before allocating lifecycle listeners or reading credentials', async () => {
    const fetcher = vi.fn();
    const { ipcMain, getConnection } = setup(fetcher);
    const sender = new Sender();
    await expect(
      ipcMain.invoke(sender, REQUEST, { ...request(), path: '/admin' })
    ).rejects.toThrow();
    await expect(
      ipcMain.invoke(sender, STREAM, { ...streamRequest(), workflowId: '../admin' })
    ).rejects.toThrow();
    expect(getConnection).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expectDetached(sender);
  });

  it.each(['invalid', '', '00000000-0000-0000-0000-000000000000', null])(
    'validates cancellation ID %j without creating an owner',
    async (value) => {
      const { ipcMain, getConnection } = setup(vi.fn());
      const sender = new Sender();
      await expect(ipcMain.invoke(sender, CANCEL, value)).rejects.toThrow('non-nil UUID');
      expect(getConnection).not.toHaveBeenCalled();
      expectDetached(sender);
    }
  );

  it('does not allocate an owner when cancelling an unknown operation', async () => {
    const { ipcMain, getConnection } = setup(vi.fn());
    const sender = new Sender();
    expect(await ipcMain.invoke(sender, CANCEL, id())).toBe(false);
    expect(getConnection).not.toHaveBeenCalled();
    expectDetached(sender);
  });

  it('shares duplicate IDs across request/stream only within the owning sender object', async () => {
    const fetching = deferred<Response>();
    const fetcher = vi.fn(() => fetching.promise);
    const { ipcMain, registration } = setup(fetcher);
    const owner = new Sender(1);
    const sameNumericId = new Sender(1);
    const sharedId = 'abcdefab-1111-4111-8111-111111111111';
    const first = observe(ipcMain.invoke(owner, REQUEST, { ...request(), id: sharedId }));
    await expect(
      ipcMain.invoke(owner, STREAM, { ...streamRequest(), id: sharedId.toUpperCase() })
    ).rejects.toThrow('already active');
    expect(await ipcMain.invoke(sameNumericId, CANCEL, sharedId)).toBe(false);
    const other = observe(ipcMain.invoke(sameNumericId, REQUEST, { ...request(), id: sharedId }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await ipcMain.invoke(owner, CANCEL, sharedId.toUpperCase())).toBe(true);
    expect(await ipcMain.invoke(owner, CANCEL, sharedId)).toBe(false);
    expect((await first).error).toMatchObject({ name: 'AbortError' });
    expectDetached(owner);
    expect(sameNumericId.listenerCount('destroyed')).toBe(1);
    registration.dispose();
    expect((await other).error).toMatchObject({ name: 'AbortError' });
    expectDetached(sameNumericId);
  });

  it('bounds combined in-flight operations per owner and releases capacity after cancellation', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const { ipcMain, registration } = setup(fetcher, 1);
    const sender = new Sender();
    const first = observe(ipcMain.invoke(sender, REQUEST, request()));
    await expect(ipcMain.invoke(sender, STREAM, streamRequest(2))).rejects.toThrow('Too many');
    expect(fetcher).toHaveBeenCalledOnce();
    await ipcMain.invoke(sender, CANCEL, id());
    await first;
    const next = observe(ipcMain.invoke(sender, STREAM, streamRequest(2)));
    expect(fetcher).toHaveBeenCalledTimes(2);
    registration.dispose();
    await next;
    expectDetached(sender);
  });

  it('uses only native credentials and cleans idle owners after a normal request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ready":true}'));
    const { ipcMain, assertTrustedSender } = setup(fetcher);
    const sender = new Sender();
    expect(
      await ipcMain.invoke(sender, REQUEST, { ...request(), apiKey: 'renderer-secret' })
    ).toEqual({ ok: true, status: 200, body: { ready: true } });
    expect(fetcher.mock.calls[0][0]).toBe(`${configuration.url}/health`);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer native-secret');
    expect(assertTrustedSender).toHaveBeenCalledWith({ sender, trusted: true }, REQUEST);
    expect(sender.send).not.toHaveBeenCalled();
    expectDetached(sender);
  });

  it('cleans up native configuration read failures and accepts the next request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    const { ipcMain, getConnection } = setup(fetcher);
    const sender = new Sender();
    getConnection.mockImplementationOnce(() => {
      throw new Error('Keyring unavailable');
    });
    await expect(ipcMain.invoke(sender, REQUEST, request())).rejects.toThrow('Keyring unavailable');
    expect(fetcher).not.toHaveBeenCalled();
    expectDetached(sender);
    expect(await ipcMain.invoke(sender, REQUEST, request())).toMatchObject({ ok: true });
    expectDetached(sender);
  });

  it('rejects already destroyed owners without native work', async () => {
    const fetcher = vi.fn();
    const { ipcMain, getConnection } = setup(fetcher);
    const sender = new Sender();
    sender.destroyed = true;
    await expect(ipcMain.invoke(sender, REQUEST, request())).rejects.toThrow('unavailable');
    expect(getConnection).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('durable workflow IPC document lifecycle', () => {
  it.each(['destroyed', 'render-process-gone', 'navigation'])(
    'aborts an idle HTTP response when the document encounters %s',
    async (lifecycle) => {
      const response = heldBody();
      const { ipcMain } = setup(vi.fn().mockResolvedValue(response.response));
      const sender = new Sender();
      const pending = observe(ipcMain.invoke(sender, REQUEST, request()));
      await vi.waitFor(() => expect(response.body.locked).toBe(true));
      if (lifecycle === 'navigation')
        sender.emit('did-start-navigation', {}, 'https://other.example', false, true);
      else sender.emit(lifecycle);
      expect((await pending).error).toMatchObject({ name: 'AbortError' });
      expect(response.cancel).toHaveBeenCalledOnce();
      expect(response.body.locked).toBe(false);
      expectDetached(sender);
    }
  );

  it('keeps same-document and subframe navigation alive', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    sender.emit('did-start-navigation', {}, `${configuration.url}#details`, true, true);
    sender.emit('did-start-navigation', {}, 'https://subframe.example', false, false);
    response.emit();
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(EVENT, id(), event));
    response.controller.close();
    expect((await pending).error).toBeUndefined();
    expectDetached(sender);
  });

  it('does not let completion from an old document remove the replacement document operation', async () => {
    const fetching = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => fetching.promise)
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const { ipcMain } = setup(fetcher);
    const sender = new Sender();
    const old = observe(ipcMain.invoke(sender, REQUEST, request()));
    sender.emit('did-start-navigation', {}, configuration.url, false, true);
    const replacement = observe(ipcMain.invoke(sender, REQUEST, request()));
    expect((await old).error).toMatchObject({ name: 'AbortError' });
    expect(sender.listenerCount('destroyed')).toBe(1);
    expect(await ipcMain.invoke(sender, CANCEL, id())).toBe(true);
    expect((await replacement).error).toMatchObject({ name: 'AbortError' });
    expectDetached(sender);
    const late = heldBody();
    fetching.resolve(late.response);
    await vi.waitFor(() => expect(late.cancel).toHaveBeenCalledOnce());
  });
});

describe('durable workflow IPC stream and connection lifecycle', () => {
  it('sends events only to the owner and removes listeners at normal EOF', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    const other = new Sender(2);
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    expect(await ipcMain.invoke(other, CANCEL, id())).toBe(false);
    response.emit();
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(EVENT, id(), event));
    expect(other.send).not.toHaveBeenCalled();
    expectDetached(other);
    response.controller.close();
    expect((await pending).error).toBeUndefined();
    expect(response.body.locked).toBe(false);
    expectDetached(sender);
  });

  it('cancels an owning stream without forwarding a buffered event', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    response.emit();
    expect(await ipcMain.invoke(sender, CANCEL, id())).toBe(true);
    expect((await pending).error).toMatchObject({ name: 'AbortError' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
    expectDetached(sender);
  });

  it.each(['url', 'apiKey', 'revision'] as const)(
    'rejects a late HTTP result after native %s changes, without requiring the invalidation hook',
    async (field) => {
      const fetching = deferred<Response>();
      const { ipcMain, connection } = setup(vi.fn(() => fetching.promise));
      const sender = new Sender();
      const pending = observe(ipcMain.invoke(sender, REQUEST, request()));
      connection[field] = field === 'url' ? 'https://next.engine.example' : 'replacement';
      const response = heldBody();
      fetching.resolve(response.response);
      expect((await pending).error).toMatchObject({ name: 'ComputerChatConnectionChangedError' });
      expect(response.cancel).toHaveBeenCalledOnce();
      expect(sender.send).not.toHaveBeenCalled();
      expectDetached(sender);
    }
  );

  it('aborts idle operations on explicit invalidation even when the configuration returns to its previous value', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain, registration, connection } = setup(
      vi.fn().mockResolvedValue(response.response)
    );
    const sender = new Sender();
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    response.emit();
    connection.apiKey = 'replacement';
    registration.invalidateConnection();
    connection.apiKey = configuration.apiKey;
    expect((await pending).error).toMatchObject({ name: 'ComputerChatConnectionChangedError' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
    expectDetached(sender);
  });

  it('rejects a changed connection before forwarding the next buffered event', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain, connection } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    connection.revision = 'revision-two';
    response.emit();
    expect((await pending).error).toMatchObject({ name: 'ComputerChatConnectionChangedError' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(response.cancel).toHaveBeenCalledOnce();
    expectDetached(sender);
  });

  it('cleans up a stream when rereading native credentials fails', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain, getConnection } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    getConnection.mockImplementation(() => {
      throw new Error('Keyring unavailable');
    });
    response.emit();
    expect((await pending).error).toMatchObject({ message: 'Keyring unavailable' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(response.cancel).toHaveBeenCalledOnce();
    expectDetached(sender);
  });

  it('cleans up a stream when sending to the owning renderer throws', async () => {
    const response = heldBody('text/event-stream');
    const { ipcMain } = setup(vi.fn().mockResolvedValue(response.response));
    const sender = new Sender();
    sender.send.mockImplementation(() => {
      throw new Error('Renderer unavailable');
    });
    const pending = observe(ipcMain.invoke(sender, STREAM, streamRequest()));
    await vi.waitFor(() => expect(response.body.locked).toBe(true));
    response.emit();
    expect((await pending).error).toMatchObject({ message: 'Renderer unavailable' });
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
    expectDetached(sender);
  });

  it('unregisters all handlers and listeners once and aborts every owner on disposal', async () => {
    const fetching = deferred<Response>();
    const { ipcMain, registration } = setup(vi.fn(() => fetching.promise));
    const owner = new Sender();
    const other = new Sender(2);
    const first = observe(ipcMain.invoke(owner, REQUEST, request()));
    const second = observe(ipcMain.invoke(other, STREAM, streamRequest()));
    const oldHandler = ipcMain.handlers.get(REQUEST)!;
    registration.dispose();
    registration.dispose();
    expect((await first).error).toMatchObject({ name: 'AbortError' });
    expect((await second).error).toMatchObject({ name: 'AbortError' });
    expect(ipcMain.handlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
    expectDetached(owner);
    expectDetached(other);
    await expect(oldHandler({ sender: owner, trusted: true }, request())).rejects.toThrow(
      'unavailable'
    );
  });
});
