import { ComputerChatConnectionChangedError } from './computer-chat-bridge';
import {
  requestDurableWorkflow,
  streamDurableWorkflowEvents,
  validateDurableWorkflowRequest,
  validateDurableWorkflowStreamRequest,
} from './durable-workflow-bridge';

type LifecycleListener = (...args: unknown[]) => void;

export interface DurableWorkflowIpcSender {
  isDestroyed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  on(event: string, listener: LifecycleListener): unknown;
  removeListener(event: string, listener: LifecycleListener): unknown;
}

export interface DurableWorkflowIpcEvent {
  sender: DurableWorkflowIpcSender;
}

export interface DurableWorkflowIpcMain<Event extends DurableWorkflowIpcEvent> {
  handle(channel: string, listener: (event: Event, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface DurableWorkflowIpcOptions<Event extends DurableWorkflowIpcEvent> {
  ipcMain: DurableWorkflowIpcMain<Event>;
  /** Must reject untrusted documents/frames as well as apply the caller's rate limits. */
  assertTrustedSender(event: Event, channel: string): void;
  /** Synchronous authoritative native configuration, including the shared connection revision. */
  getConnection(): { url: string; apiKey: string; revision: string };
  fetcher?: typeof fetch;
  maxActivePerOwner?: number;
}

export interface DurableWorkflowIpcRegistration {
  /** Call after every native engine URL/key mutation, including explicit revision invalidation. */
  invalidateConnection(): void;
  dispose(): void;
}

interface Operation {
  controller: AbortController;
  generation: number;
}

interface Owner {
  sender: DurableWorkflowIpcSender;
  active: Map<string, Operation>;
  listeners: Map<string, LifecycleListener>;
}

const CHANNELS = [
  'durable-workflows:request',
  'durable-workflows:stream',
  'durable-workflows:cancel',
] as const;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function cancellationId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value))
    throw new Error('Durable workflow cancellation ID must be a non-nil UUID');
  return value.toLowerCase();
}

/** Registers ownership and lifecycle guards without importing or starting Electron. */
export function registerDurableWorkflowIpc<Event extends DurableWorkflowIpcEvent>(
  options: DurableWorkflowIpcOptions<Event>
): DurableWorkflowIpcRegistration {
  const { ipcMain, assertTrustedSender, getConnection } = options;
  const limit = options.maxActivePerOwner ?? 16;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64)
    throw new Error('Durable workflow concurrency must be between 1 and 64 per owner');
  // Object identity is intentional: a reused/spoofed numeric sender ID cannot take ownership.
  const owners = new Map<DurableWorkflowIpcSender, Owner>();
  let generation = 0;
  let disposed = false;

  const detach = (owner: Owner) => {
    if (owners.get(owner.sender) === owner) owners.delete(owner.sender);
    for (const [event, listener] of owner.listeners) owner.sender.removeListener(event, listener);
    owner.listeners.clear();
  };
  const abortOwner = (owner: Owner, reason: Error) => {
    detach(owner);
    for (const operation of owner.active.values()) operation.controller.abort(reason);
  };
  const assertSender = (event: Event, channel: string) => {
    if (disposed) throw new Error('Durable workflow IPC is unavailable');
    assertTrustedSender(event, channel);
    if (event.sender.isDestroyed()) throw new Error('The desktop window is unavailable');
  };
  const admit = (sender: DurableWorkflowIpcSender, id: string) => {
    let owner = owners.get(sender);
    if (owner?.active.has(id)) throw new Error('Durable workflow request ID is already active');
    if (owner && owner.active.size >= limit)
      throw new Error('Too many active workflow operations; wait or cancel an existing operation');
    if (!owner) {
      owner = { sender, active: new Map(), listeners: new Map() };
      const current = owner;
      const unavailable = () =>
        abortOwner(current, new DOMException('The desktop document closed', 'AbortError'));
      const navigation: LifecycleListener = (...args) => {
        // did-start-navigation(event, url, isInPlace, isMainFrame, ...).
        // Hash/history changes and subframes do not replace the owning app document.
        if (args[3] === true && args[2] === false) unavailable();
      };
      owner.listeners.set('destroyed', unavailable);
      owner.listeners.set('render-process-gone', unavailable);
      owner.listeners.set('did-start-navigation', navigation);
      owners.set(sender, owner);
      for (const [event, listener] of owner.listeners) sender.on(event, listener);
    }
    const operation = { controller: new AbortController(), generation };
    owner.active.set(id, operation);
    return { owner, operation };
  };
  const finish = (owner: Owner, id: string, operation: Operation) => {
    if (owner.active.get(id) === operation) owner.active.delete(id);
    if (!owner.active.size) detach(owner);
  };
  const connectionScope = (owner: Owner, id: string, operation: Operation) => {
    const configuration = { ...getConnection() };
    const isCurrent = () => {
      if (
        disposed ||
        operation.controller.signal.aborted ||
        operation.generation !== generation ||
        owner.sender.isDestroyed() ||
        owners.get(owner.sender) !== owner ||
        owner.active.get(id) !== operation
      )
        return false;
      const current = getConnection();
      return (
        current.url === configuration.url &&
        current.apiKey === configuration.apiKey &&
        current.revision === configuration.revision
      );
    };
    const assertCurrent = () => {
      operation.controller.signal.throwIfAborted();
      if (!isCurrent()) throw new ComputerChatConnectionChangedError();
    };
    return { configuration, isCurrent, assertCurrent };
  };

  ipcMain.handle(CHANNELS[0], async (event, value) => {
    assertSender(event, CHANNELS[0]);
    const request = validateDurableWorkflowRequest(value);
    const id = request.id.toLowerCase();
    const { owner, operation } = admit(event.sender, id);
    try {
      const scope = connectionScope(owner, id, operation);
      scope.assertCurrent();
      const response = await requestDurableWorkflow(
        request,
        scope.configuration,
        options.fetcher,
        scope.isCurrent,
        operation.controller.signal
      );
      scope.assertCurrent();
      return response;
    } finally {
      finish(owner, id, operation);
    }
  });
  ipcMain.handle(CHANNELS[1], async (event, value) => {
    assertSender(event, CHANNELS[1]);
    const request = validateDurableWorkflowStreamRequest(value);
    const id = request.id.toLowerCase();
    const { owner, operation } = admit(event.sender, id);
    try {
      const scope = connectionScope(owner, id, operation);
      scope.assertCurrent();
      await streamDurableWorkflowEvents(
        request,
        scope.configuration,
        (payload) => {
          scope.assertCurrent();
          owner.sender.send('durable-workflows:event', request.id, payload);
        },
        options.fetcher,
        scope.isCurrent,
        operation.controller.signal
      );
      scope.assertCurrent();
    } finally {
      finish(owner, id, operation);
    }
  });
  ipcMain.handle(CHANNELS[2], (event, value) => {
    assertSender(event, CHANNELS[2]);
    const id = cancellationId(value);
    const operation = owners.get(event.sender)?.active.get(id);
    if (!operation || operation.controller.signal.aborted) return false;
    operation.controller.abort(new DOMException('Workflow operation cancelled', 'AbortError'));
    return true;
  });

  return {
    invalidateConnection() {
      generation += 1;
      for (const owner of owners.values())
        for (const operation of owner.active.values())
          operation.controller.abort(new ComputerChatConnectionChangedError());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const channel of CHANNELS) ipcMain.removeHandler(channel);
      for (const owner of owners.values())
        abortOwner(owner, new DOMException('Workflow transport disposed', 'AbortError'));
    },
  };
}
