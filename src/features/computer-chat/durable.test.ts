/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { durableChatController as controller } from './durable';
import { approvalVersion } from './approvals';
import { DEFAULT_CHAT_CONFIGURATION, type DurableChatStatus } from './durableTypes';
import { useComputerChatsStore as chats } from './store';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';

const tenant = '11111111-1111-4111-8111-111111111111';
const brand = '22222222-2222-4222-8222-222222222222';
const request = vi.fn();
const saveArtifact = vi.fn();
function status(id: string, patch: Partial<DurableChatStatus> = {}): DurableChatStatus {
  return {
    version: 1,
    request_id: id,
    brand_id: brand,
    status: 'idle',
    session: null,
    messages: [],
    events: [],
    last_event_id: 0,
    pending_action: null,
    artifacts: [],
    verification: null,
    workspace: null,
    screenshot: null,
    checkpoint: null,
    usage: {},
    budget: DEFAULT_CHAT_CONFIGURATION.budget,
    actions: 0,
    turns: 0,
    tokens: 0,
    paused: false,
    stop_requested: false,
    cleanup_verified: false,
    error: null,
    generation: 0,
    ...patch,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  chats.setState({ chats: [], configurations: {}, loaded: true, busy: {}, connections: {} });
  useAuthStore.setState({ tenant: { id: tenant }, currentBrand: { id: brand } } as never);
  useDurableWorkflowsStore.setState({
    initialized: true,
    apiKey: 'test-key',
    connectionRevision: 'test-revision',
    configuring: false,
    engineUrl: 'https://engine.example',
  });
  window.electronAPI = {
    computerChat: { request, saveArtifact },
    store: { set: vi.fn().mockResolvedValue(true), get: vi.fn() },
  } as unknown as typeof window.electronAPI;
});

async function create() {
  return controller.create(tenant, brand, DEFAULT_CHAT_CONFIGURATION);
}
describe('durable conversation recovery', () => {
  it.each([
    [
      'an outside path',
      { criteria: [{ path: '/etc/private.txt', kind: 'contains', expected: 'ok' }] },
    ],
    [
      'a dot path',
      { criteria: [{ path: '/workspace/./report.json', kind: 'json', expected: true }] },
    ],
    [
      'a backslash path',
      { criteria: [{ path: '/workspace/a\\b.txt', kind: 'contains', expected: 'ok' }] },
    ],
    [
      'a control character',
      { criteria: [{ path: '/workspace/a\u0085.txt', kind: 'contains', expected: 'ok' }] },
    ],
    [
      'a multibyte path over 1024 bytes',
      { criteria: [{ path: `/workspace/${'漢'.repeat(339)}`, kind: 'contains', expected: 'ok' }] },
    ],
    [
      'an oversized expected value',
      {
        criteria: [
          { path: '/workspace/report.txt', kind: 'contains', expected: '🙂'.repeat(4096) },
        ],
      },
    ],
    [
      'five distinct files',
      {
        criteria: Array.from({ length: 5 }, (_, i) => ({
          path: `/workspace/${i}.txt`,
          kind: 'contains',
          expected: 'ok',
        })),
      },
    ],
    ['a model over 255 bytes', { model: '漢'.repeat(86) }],
    [
      'an executable with arguments',
      {
        permissions: {
          ...DEFAULT_CHAT_CONFIGURATION.permissions,
          allowed_executables: ['python3 -c'],
        },
      },
    ],
    ['an invalid connector name', { mcp_servers: ['inventory/reports'] }],
  ])('rejects %s before saving or starting a computer', async (_name, patch) => {
    await expect(
      controller.create(tenant, brand, {
        ...DEFAULT_CHAT_CONFIGURATION,
        ...patch,
      } as typeof DEFAULT_CHAT_CONFIGURATION)
    ).rejects.toThrow();
    expect(chats.getState().chats).toEqual([]);
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('requests a key instead of repeatedly reconnecting without credentials', async () => {
    const id = await create();
    useDurableWorkflowsStore.setState({ apiKey: null });
    await controller.refresh(id);
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().connections[id]).toMatchObject({
      status: 'attention',
      message: 'Enter your workflow API key in connection settings to reconnect.',
      nextRetryAt: undefined,
    });
    useDurableWorkflowsStore.setState({ apiKey: 'restored-key' });
    request.mockResolvedValueOnce({ ok: true, status: 200, body: status(id) });
    await controller.refresh(id);
    expect(request).toHaveBeenCalledOnce();
    expect(chats.getState().connections[id]).toMatchObject({ status: 'connected', failures: 0 });
  });
  it('moves the submitted draft to a stable pending message before networking', async () => {
    const id = await create();
    chats.getState().setDraft(id, '  Prepare report  ');
    request.mockImplementation(async () => {
      expect(chats.getState().chats[0].draft).toBeUndefined();
      expect(chats.getState().chats[0].pendingMessage).toMatchObject({ content: 'Prepare report' });
      expect(vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1]).toEqual([
        expect.objectContaining({
          pendingMessage: expect.objectContaining({ content: 'Prepare report' }),
        }),
      ]);
      throw new Error('Connection lost');
    });
    await controller.send(id, '  Prepare report  ');
    expect(request).toHaveBeenCalledTimes(1);
    expect(chats.getState().chats[0].error).toBe('Connection lost');
    expect(chats.getState().chats[0].pendingMessage?.content).toBe('Prepare report');
  });

  it('preserves newer draft text while a previous submission awaits acknowledgement', async () => {
    const id = await create();
    chats.getState().setDraft(id, 'Submitted draft');
    let release!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, body: {} });
        })
    );
    const sending = controller.send(id, 'Submitted draft');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    chats.getState().setDraft(id, 'Next draft');
    const pending = chats.getState().chats[0].pendingMessage!;
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, {
        messages: [{ ...pending, role: 'user', timestamp: 1 }],
      }),
    });
    release();
    await sending;
    expect(chats.getState().chats[0].draft).toBe('Next draft');
    expect(chats.getState().chats[0].pendingMessage).toBeUndefined();
  });

  it('retains oversized UTF-8 drafts without creating a pending request', async () => {
    const id = await create();
    const content = '🙂'.repeat(2001);
    chats.getState().setDraft(id, content);
    await controller.send(id, content);
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0]).toMatchObject({
      draft: content,
      error: expect.stringContaining('UTF-8 bytes'),
    });
    expect(chats.getState().chats[0].pendingMessage).toBeUndefined();
  });
  it('persists an identity before submission and retries a lost start acknowledgement with that identity', async () => {
    const id = await create();
    const identity = chats.getState().chats[0].durableSession!;
    expect(request).not.toHaveBeenCalled();
    request.mockRejectedValueOnce(new Error('Connection lost after server accepted request'));
    await controller.provision(id);
    expect(chats.getState().chats[0].error).toContain('Connection lost');
    request.mockImplementation(async ({ path }) => ({
      ok: true,
      status: 200,
      body: path.endsWith('/start')
        ? { workflow_id: identity.workflowId, run_id: 'server-run' }
        : status(id),
    }));
    await controller.provision(id);
    const starts = request.mock.calls.filter(([call]) => call.path.endsWith('/start'));
    expect(starts).toHaveLength(2);
    expect(starts[0][0].body).toEqual(starts[1][0].body);
    expect(starts[0][0].body.request_id).toBe(id);
    expect(chats.getState().chats[0].durableSession?.runId).toBe('server-run');
  });

  it('resends the same message UUID until authoritative history confirms receipt', async () => {
    const id = await create();
    request.mockRejectedValueOnce(new Error('Lost signal acknowledgement'));
    await controller.send(id, 'Make a report');
    const pending = chats.getState().chats[0].pendingMessage!;
    expect(pending.content).toBe('Make a report');
    request.mockImplementation(async ({ path }) => ({
      ok: true,
      status: 200,
      body: path.endsWith('/status')
        ? status(id, { last_event_id: 1, messages: [{ ...pending, role: 'user', timestamp: 1 }] })
        : {},
    }));
    await controller.send(id, pending.content);
    const signals = request.mock.calls.filter(([call]) => call.path.endsWith('/messages'));
    expect(signals[0][0].body).toEqual(signals[1][0].body);
    expect(chats.getState().chats[0].pendingMessage).toBeUndefined();
    expect(chats.getState().chats[0].messages).toHaveLength(1);
  });

  it('refuses actions after switching brand or workflow engine', async () => {
    const id = await create();
    useAuthStore.setState({ currentBrand: { id: 'another-brand' } } as never);
    await controller.send(id, 'Run');
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0].error).toContain('organization and brand');
    useAuthStore.setState({ currentBrand: { id: brand } } as never);
    useDurableWorkflowsStore.setState({ engineUrl: 'https://different.example' });
    await controller.control(id, 'resume');
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0].error).toContain('workflow engine URL');
  });

  it('rejects a status response for a different conversation without replacing its transcript', async () => {
    const id = await create();
    request.mockResolvedValue({ ok: true, status: 200, body: status('different-chat') });
    await controller.refresh(id);
    expect(chats.getState().connections[id]?.message).toContain('identity');
    expect(chats.getState().connections[id]?.status).toBe('attention');
    expect(chats.getState().chats[0].serverState).toBeUndefined();
  });

  it('refuses to export bytes that differ from the verification digest', async () => {
    const id = await create();
    await chats.getState().save({
      ...chats.getState().chats[0],
      serverState: status(id, {
        artifacts: [
          {
            path: '/workspace/report.txt',
            sha256: '0'.repeat(64),
            size_bytes: 7,
            media_type: 'text/plain',
          },
        ],
      }),
    });
    request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        path: '/workspace/report.txt',
        sha256: '0'.repeat(64),
        size_bytes: 7,
        content_base64: btoa('changed'),
        media_type: 'text/plain',
      },
    });
    await expect(controller.exportArtifact(id, '/workspace/report.txt')).rejects.toThrow('digest');
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('imports history without automatically sending a new instruction', async () => {
    const id = await controller.create(tenant, brand, DEFAULT_CHAT_CONFIGURATION, {
      id: 'legacy',
      title: 'Previous chat',
      messages: [{ role: 'user', content: 'Old instruction' }],
    });
    const chat = chats.getState().chats.find((c) => c.id === id)!;
    expect(chat.durableSession?.initialMessage).toBeUndefined();
    expect(chat.durableSession?.importedMessages?.[0].content).toContain('Old instruction');
    expect(request).not.toHaveBeenCalled();
  });
  it('starts continued multilingual chats within the engine’s UTF-8 message limit', async () => {
    const original = '🙂漢é'.repeat(2000);
    const id = await controller.create(tenant, brand, DEFAULT_CHAT_CONFIGURATION, {
      id: 'legacy',
      title: 'Multilingual report',
      messages: [{ role: 'assistant', content: original }],
    });
    const identity = chats.getState().chats[0].durableSession!;
    const imported = identity.importedMessages![0];
    expect(imported.content).toMatch(/^Previous assistant: /);
    expect(new TextEncoder().encode(imported.content).byteLength).toBeLessThanOrEqual(8000);
    expect(imported.content).not.toContain('\uFFFD');
    expect(original.startsWith(imported.content.slice('Previous assistant: '.length))).toBe(true);
    expect(request).not.toHaveBeenCalled();
    request.mockImplementation(async ({ path }) => ({
      ok: true,
      status: 200,
      body: path.endsWith('/start')
        ? { workflow_id: identity.workflowId, run_id: 'continued-run' }
        : status(id),
    }));
    await controller.provision(id);
    const start = request.mock.calls.find(([call]) => call.path.endsWith('/start'))![0];
    expect(start.body.imported_messages).toEqual([imported]);
    expect(start.body.initial_message).toBeUndefined();
    expect(chats.getState().chats[0].durableSession?.runId).toBe('continued-run');
    expect(chats.getState().chats[0].error).toBeUndefined();
  });
  it('retains received messages and timeline entries across compacted server windows', async () => {
    const id = await create();
    const first = status(id, {
      last_event_id: 2,
      messages: [
        { id: 'one', role: 'user', content: 'First request', timestamp: 1 },
        { id: 'two', role: 'assistant', content: 'First answer', timestamp: 2 },
      ],
      events: [
        { id: 1, kind: 'message_received', at: 1, detail: {} },
        { id: 2, kind: 'action_completed', at: 2, detail: {} },
      ],
    });
    request.mockResolvedValueOnce({ ok: true, status: 200, body: first });
    await controller.refresh(id);
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, {
        last_event_id: 3,
        messages: [{ id: 'three', role: 'assistant', content: 'Next answer', timestamp: 3 }],
        events: [{ id: 3, kind: 'model_started', at: 3, detail: {} }],
      }),
    });
    await controller.refresh(id);
    expect(chats.getState().chats[0].messages.map((m) => m.id)).toEqual(['one', 'two', 'three']);
    expect(chats.getState().chats[0].timeline?.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('backs off transient status failures without writing disk snapshots or replaying actions', async () => {
    const id = await create();
    vi.mocked(window.electronAPI!.store.set).mockClear();
    request.mockResolvedValue({
      ok: false,
      status: 503,
      body: { message: 'Engine temporarily unavailable' },
    });
    const before = Date.now();
    await controller.refresh(id);
    expect(chats.getState().connections[id]).toMatchObject({ status: 'reconnecting', failures: 1 });
    expect(chats.getState().connections[id].nextRetryAt).toBeGreaterThanOrEqual(before + 3000);
    await controller.refresh(id);
    expect(chats.getState().connections[id].failures).toBe(2);
    expect(chats.getState().connections[id].nextRetryAt).toBeGreaterThanOrEqual(before + 6000);
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(request.mock.calls.every(([call]) => call.path.endsWith('/status'))).toBe(true);
  });

  it('requires attention for rejected credentials and resets backoff after a successful manual retry', async () => {
    const id = await create();
    request.mockResolvedValueOnce({ ok: false, status: 401, body: { message: 'Invalid API key' } });
    await controller.refresh(id);
    expect(chats.getState().connections[id]).toMatchObject({ status: 'attention', failures: 1 });
    expect(chats.getState().connections[id].nextRetryAt).toBeUndefined();
    request.mockResolvedValueOnce({ ok: true, status: 200, body: status(id) });
    await controller.refresh(id);
    expect(chats.getState().connections[id]).toMatchObject({ status: 'connected', failures: 0 });
  });

  it('discards responses arriving after the selected brand changes', async () => {
    const id = await create();
    let reply!: (response: unknown) => void;
    request.mockReturnValueOnce(
      new Promise((resolve) => {
        reply = resolve;
      })
    );
    const pending = controller.refresh(id);
    useAuthStore.setState({ currentBrand: { id: 'another-brand' } } as never);
    reply({ ok: true, status: 200, body: status(id) });
    await pending;
    expect(chats.getState().chats[0].serverState).toBeUndefined();
    expect(chats.getState().connections[id]).toBeUndefined();
  });

  it('does not replace newer observations with an earlier workflow generation', async () => {
    const id = await create();
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, { generation: 2, last_event_id: 20, status: 'paused', paused: true }),
    });
    await controller.refresh(id);
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, { generation: 1, last_event_id: 19 }),
    });
    await controller.refresh(id);
    expect(chats.getState().chats[0].serverState?.status).toBe('paused');
  });

  it('applies cleanup and screenshot changes even when the event cursor stays unchanged', async () => {
    const id = await create();
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, { status: 'stopped' }),
    });
    await controller.refresh(id);
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, {
        status: 'stopped',
        cleanup_verified: true,
        screenshot: 'data:image/jpeg;base64,AAAA',
      }),
    });
    await controller.refresh(id);
    expect(chats.getState().chats[0].stopped).toBe(true);
    expect(chats.getState().chats[0].screenshot).toContain('AAAA');
  });

  it('preserves a custom name when the first message is sent and avoids promoting idle polls to activity', async () => {
    const id = await create();
    await chats.getState().updateMetadata(id, { title: 'My named project' });
    const timestamp = chats.getState().chats[0].updatedAt;
    request.mockImplementation(async ({ path }) => ({
      ok: true,
      status: 200,
      body: path.endsWith('/status') ? status(id) : {},
    }));
    await controller.refresh(id);
    expect(chats.getState().chats[0].updatedAt).toBe(timestamp);
    await controller.send(id, 'First instruction');
    expect(chats.getState().chats[0].title).toBe('My named project');
  });
  it('keeps a successful server observation distinct from a failed local save', async () => {
    const id = await create();
    vi.mocked(window.electronAPI!.store.set).mockRejectedValueOnce(
      new Error('Device storage full')
    );
    request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: status(id, {
        messages: [{ id: 'new', role: 'assistant', content: 'Completed result', timestamp: 1 }],
      }),
    });
    await controller.refresh(id);
    expect(chats.getState().connections[id].status).toBe('connected');
    expect(chats.getState().persistenceError).toBe('Device storage full');
    expect(chats.getState().chats[0].messages[0].content).toBe('Completed result');
    await chats.getState().flush();
    expect(chats.getState().persistenceError).toBeUndefined();
  });
});

describe('collected artifact scope and saving', () => {
  async function collected() {
    const id = await create();
    const artifact = {
      path: '/workspace/report.txt',
      sha256: createHash('sha256').update('proof').digest('hex'),
      size_bytes: 5,
      media_type: 'text/plain',
    };
    await chats
      .getState()
      .save({ ...chats.getState().chats[0], serverState: status(id, { artifacts: [artifact] }) });
    return { id, artifact, body: { ...artifact, content_base64: btoa('proof') } };
  }
  it('refuses a self-consistent response for a newer file version', async () => {
    const { id, artifact } = await collected();
    request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        ...artifact,
        sha256: createHash('sha256').update('other').digest('hex'),
        content_base64: btoa('other'),
      },
    });
    await expect(controller.exportArtifact(id, artifact.path, artifact)).rejects.toThrow(
      'changed since collection'
    );
    expect(saveArtifact).not.toHaveBeenCalled();
  });
  it.each(['brand', 'engine', 'credential', 'artifact'] as const)(
    'discards a response after the %s changes',
    async (change) => {
      const { id, artifact, body } = await collected();
      let release!: (value: unknown) => void;
      request.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      const reading = controller.readArtifact(id, artifact.path, artifact);
      if (change === 'brand') useAuthStore.setState({ currentBrand: { id: 'different' } } as never);
      if (change === 'engine')
        useDurableWorkflowsStore.setState({ engineUrl: 'https://different.example' });
      if (change === 'credential') useDurableWorkflowsStore.setState({ apiKey: 'replaced-key' });
      if (change === 'artifact')
        await chats.getState().save({
          ...chats.getState().chats[0],
          serverState: status(id, { artifacts: [{ ...artifact, sha256: 'f'.repeat(64) }] }),
        });
      release({ ok: true, status: 200, body });
      await expect(reading).rejects.toThrow(
        change === 'artifact' ? 'changed since collection' : 'workspace changed'
      );
      expect(saveArtifact).not.toHaveBeenCalled();
    }
  );
  it('returns native cancellation, blocks concurrent saves, and allows retry', async () => {
    const { id, artifact, body } = await collected();
    request.mockResolvedValue({ ok: true, status: 200, body });
    let finish!: (value: boolean) => void;
    saveArtifact.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const saving = controller.exportArtifact(id, artifact.path, artifact);
    await vi.waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    await expect(controller.exportArtifact(id, artifact.path)).rejects.toThrow(
      'already being saved'
    );
    expect(saveArtifact).toHaveBeenCalledWith({
      filename: 'report.txt',
      sha256: artifact.sha256,
      contentBase64: btoa('proof'),
    });
    finish(false);
    expect(await saving).toBe(false);
    saveArtifact.mockResolvedValueOnce(true);
    expect(await controller.exportArtifact(id, artifact.path, artifact)).toBe(true);
  });
});

describe('ended computer message safety', () => {
  it.each(['completed', 'stopped', 'budget_exhausted', 'cleanup_pending', 'failed'])(
    'refuses sending to %s before contacting the engine',
    async (state) => {
      const id = await create();
      const pendingMessage = { id: 'pending', content: 'Previous instruction' };
      await chats.getState().save({
        ...chats.getState().chats[0],
        pendingMessage,
        draft: 'New instruction',
        serverState: status(id, { status: state }),
      });
      await controller.send(id, 'New instruction');
      expect(request).not.toHaveBeenCalled();
      expect(chats.getState().chats[0]).toMatchObject({
        pendingMessage,
        draft: 'New instruction',
        error: expect.stringContaining('ended or is stopping'),
      });
    }
  );
  it('also refuses a new instruction while stopping', async () => {
    const id = await create();
    await chats
      .getState()
      .save({ ...chats.getState().chats[0], serverState: status(id, { stop_requested: true }) });
    await controller.send(id, 'Run');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('action-bound reviews', () => {
  async function reviewing() {
    const id = await create();
    const value = chats.getState().chats[0];
    const state = status(id, {
      status: 'awaiting_approval',
      pending_action: {
        request_id: 'action',
        name: 'execute',
        arguments: {},
        command: ['python3', 'report.py'],
        admission: {
          final_verdict: 'ask_user',
          evidence_ids: [],
          evaluation: { canonical_action_hash: 'hash', triggered_rules: [] },
        },
        review_started_ms: Date.now(),
        result_available: false,
        rewritten: false,
      },
    });
    await chats.getState().save({ ...value, serverState: state });
    chats.getState().setConnection(id, { status: 'connected', failures: 0 });
    request.mockImplementation(async ({ path }) => ({
      ok: true,
      status: 200,
      body: path.endsWith('/status') ? status(id) : {},
    }));
    return { id, state, version: approvalVersion(chats.getState().chats[0]) };
  }
  it('sends only the displayed request and hash, then refreshes status', async () => {
    const { id, version } = await reviewing();
    await controller.review(id, version, true);
    expect(request.mock.calls[0][0]).toMatchObject({
      path: expect.stringContaining('/review'),
      body: { request_id: 'action', action_hash: 'hash', approved: true, accept_rewrite: false },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('sends rewrite consent only for an approved supported replacement', async () => {
    const { id, state } = await reviewing();
    state.pending_action!.admission!.final_verdict = 'rewrite';
    state.pending_action!.admission!.evaluation.rewritten_action = {
      type: 'execute_command',
      command: ['python3', 'safe.py'],
    };
    await chats.getState().save({ ...chats.getState().chats[0], serverState: state });
    await controller.review(id, approvalVersion(chats.getState().chats[0]), true, true);
    expect(request.mock.calls[0][0].body).toMatchObject({ approved: true, accept_rewrite: true });
  });
  it('never sends replacement consent with a rejection', async () => {
    const { id, version } = await reviewing();
    await controller.review(id, version, false, true);
    expect(request.mock.calls[0][0].body).toMatchObject({ approved: false, accept_rewrite: false });
  });
  it('refuses an action changed while local persistence is pending', async () => {
    const { id, version, state } = await reviewing();
    let release!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        })
    );
    const reviewingAction = controller.review(id, version, true);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    chats.setState({
      chats: [
        {
          ...chats.getState().chats[0],
          serverState: {
            ...state,
            pending_action: { ...state.pending_action!, command: ['python3', 'changed.py'] },
          },
        },
      ],
    });
    release();
    await reviewingAction;
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0].error).toContain('action changed');
  });
  it.each([
    'expired',
    'deny',
    'stopping',
    'result',
    'disconnected',
    'no consent',
    'unsupported rewrite',
  ])('refuses %s before submitting', async (kind) => {
    const { id, state } = await reviewing();
    if (kind === 'expired') state.pending_action!.review_started_ms -= 600001;
    if (kind === 'deny') state.pending_action!.admission!.final_verdict = 'deny';
    if (kind === 'stopping') state.stop_requested = true;
    if (kind === 'result') state.pending_action!.result_available = true;
    if (kind === 'disconnected')
      chats.getState().setConnection(id, { status: 'reconnecting', failures: 1 });
    if (kind === 'no consent' || kind === 'unsupported rewrite') {
      state.pending_action!.admission!.final_verdict = 'rewrite';
      state.pending_action!.admission!.evaluation.rewritten_action = {
        type: 'execute_command',
        command: ['python3', 'safe.py'],
      };
      state.pending_action!.rewritten = kind === 'unsupported rewrite';
    }
    await chats.getState().save({ ...chats.getState().chats[0], serverState: state });
    await controller.review(
      id,
      approvalVersion(chats.getState().chats[0]),
      true,
      kind === 'unsupported rewrite'
    );
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0].error).toBeTruthy();
  });
});

describe('durable connection changes during requests', () => {
  it.each(['credential', 'engine', 'brand'] as const)(
    'keeps a saved instruction unsubmitted if the %s changes while saving',
    async (change) => {
      const id = await create();
      chats.getState().setDraft(id, 'Prepare a private report');
      let release!: () => void;
      let blocked = false;
      vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, value) => {
        if (!blocked && (value as { pendingMessage?: unknown }[])[0]?.pendingMessage) {
          blocked = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return true;
      });
      request.mockImplementation(async ({ path }) => ({
        ok: true,
        status: 200,
        body: path.endsWith('/status') ? status(id) : {},
      }));
      const sending = controller.send(id, 'Prepare a private report');
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      const pending = { ...chats.getState().chats[0].pendingMessage! };
      if (change === 'credential') useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
      if (change === 'engine')
        useDurableWorkflowsStore.setState({ engineUrl: 'https://replacement.example' });
      if (change === 'brand')
        useAuthStore.setState({ currentBrand: { id: 'other-brand' } } as never);
      release();
      await sending;
      expect(request).not.toHaveBeenCalled();
      expect(chats.getState().chats[0].pendingMessage).toEqual(pending);
    }
  );

  it('discards status fetched with a replaced credential', async () => {
    const id = await create();
    let release!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const refreshing = controller.refresh(id);
    useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
    release({ ok: true, status: 200, body: status(id, { status: 'paused', paused: true }) });
    await refreshing;
    expect(chats.getState().chats[0].serverState).toBeUndefined();
    expect(chats.getState().connections[id]).toBeUndefined();
  });

  it('does not let a late authentication failure replace a newly validated connection', async () => {
    const id = await create();
    let release!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const refreshing = controller.refresh(id);
    useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
    const current = { status: 'connected' as const, failures: 0, lastSyncedAt: 900 };
    chats.getState().setConnection(id, current);
    release({ ok: false, status: 401, body: { message: 'Old credential expired' } });
    await refreshing;
    expect(chats.getState().connections[id]).toEqual(current);
  });
});

describe('connection trust and operation lifetime', () => {
  it('retains an unstarted local identity if its connection changes during creation', async () => {
    let release!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(true);
        })
    );
    const creating = create();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
    release();
    await expect(creating).rejects.toThrow('saved locally');
    expect(chats.getState().chats).toHaveLength(1);
    expect(chats.getState().chats[0]).toMatchObject({
      tenantId: tenant,
      brandId: brand,
      durableSession: { engineUrl: 'https://engine.example' },
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('invalidates cached connection trust before a credential update can authorize a review', async () => {
    const id = await create();
    chats.getState().setConnection(id, { status: 'connected', failures: 0 });
    useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
    expect(chats.getState().connections[id]).toBeUndefined();
  });
  it('discards an earlier response after switching away and back to the same connection', async () => {
    const id = await create();
    let release!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const refreshing = controller.refresh(id);
    useDurableWorkflowsStore.setState({ engineUrl: 'https://elsewhere.example' });
    useDurableWorkflowsStore.setState({ engineUrl: 'https://engine.example' });
    release({ ok: true, status: 200, body: status(id) });
    await refreshing;
    expect(chats.getState().chats[0].serverState).toBeUndefined();
    expect(chats.getState().connections[id]).toBeUndefined();
  });
  it('refuses a control if its connection changes during the initial save', async () => {
    const id = await create();
    let release!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(true);
        })
    );
    const controlling = controller.control(id, 'stop');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    useDurableWorkflowsStore.setState({ apiKey: 'replacement-key' });
    release();
    await controlling;
    expect(request).not.toHaveBeenCalled();
  });
  it('does not send a saved instruction after shutdown arrives during persistence', async () => {
    const id = await create();
    let release!: () => void;
    let blocked = false;
    vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, value) => {
      if (!blocked && (value as { pendingMessage?: unknown }[])[0]?.pendingMessage) {
        blocked = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return true;
    });
    const sending = controller.send(id, 'Prepare report');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    chats.setState({
      chats: [{ ...chats.getState().chats[0], serverState: status(id, { stop_requested: true }) }],
    });
    release();
    await sending;
    expect(request).not.toHaveBeenCalled();
    expect(chats.getState().chats[0].pendingMessage?.content).toBe('Prepare report');
  });
});
