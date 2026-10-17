/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputerChatsStore as store } from './store';
import type { ComputerChat } from './types';
import { DEFAULT_CHAT_CONFIGURATION } from './durableTypes';

function fixture(): ComputerChat {
  return {
    id: crypto.randomUUID(),
    tenantId: 'tenant',
    brandId: 'brand',
    title: 'Saved chat',
    createdAt: 'now',
    updatedAt: 'now',
    workflows: [],
    messages: [],
    session: {
      id: 'session',
      organizationId: 'org',
      currentSandboxId: 'sandbox',
      status: 'running',
    },
  };
}
beforeEach(() => {
  store.setState({ chats: [], loaded: false, busy: {}, persistenceError: undefined });
  window.electronAPI = {
    store: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) },
  } as unknown as typeof window.electronAPI;
});
afterEach(async () => {
  await store
    .getState()
    .flushDrafts()
    .catch(() => undefined);
  vi.useRealTimers();
});

describe('computer chat persistence', () => {
  it('serializes brand default saves and merges each committed brand', async () => {
    store.setState({ configurations: {} });
    let release!: (value: boolean) => void;
    const write = vi.mocked(window.electronAPI!.store.set);
    write.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        })
    );
    const first = store
      .getState()
      .setConfiguration('tenant:first', { ...DEFAULT_CHAT_CONFIGURATION, model: 'first-model' });
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const second = store
      .getState()
      .setConfiguration('tenant:second', { ...DEFAULT_CHAT_CONFIGURATION, model: 'second-model' });
    try {
      await Promise.resolve();
      expect(write).toHaveBeenCalledOnce();
    } finally {
      release(true);
      await Promise.allSettled([first, second]);
    }
    expect(write.mock.lastCall?.[1]).toMatchObject({
      'tenant:first': { model: 'first-model' },
      'tenant:second': { model: 'second-model' },
    });
    expect(store.getState().configurations['tenant:first'].model).toBe('first-model');
    expect(store.getState().configurations['tenant:second'].model).toBe('second-model');
  });
  it('continues queued defaults after a rejected write without committing the failed settings', async () => {
    store.setState({ configurations: { 'tenant:first': DEFAULT_CHAT_CONFIGURATION } });
    let reject!: (reason: Error) => void;
    const write = vi.mocked(window.electronAPI!.store.set);
    write.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, fail) => {
          reject = fail;
        })
    );
    const first = store
      .getState()
      .setConfiguration('tenant:first', { ...DEFAULT_CHAT_CONFIGURATION, model: 'failed-model' });
    const failed = expect(first).rejects.toThrow('Disk unavailable');
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const second = store
      .getState()
      .setConfiguration('tenant:second', { ...DEFAULT_CHAT_CONFIGURATION, model: 'second-model' });
    reject(new Error('Disk unavailable'));
    await failed;
    await second;
    expect(store.getState().configurations['tenant:first']).toEqual(DEFAULT_CHAT_CONFIGURATION);
    expect(store.getState().configurations['tenant:second'].model).toBe('second-model');
    expect(write.mock.lastCall?.[1]).toMatchObject({
      'tenant:first': DEFAULT_CHAT_CONFIGURATION,
      'tenant:second': { model: 'second-model' },
    });
  });
  it('requires a successful defaults acknowledgement and allows retry', async () => {
    store.setState({ configurations: { 'tenant:brand': DEFAULT_CHAT_CONFIGURATION } });
    const next = { ...DEFAULT_CHAT_CONFIGURATION, model: 'next-model' };
    vi.mocked(window.electronAPI!.store.set).mockResolvedValueOnce(false);
    await expect(store.getState().setConfiguration('tenant:brand', next)).rejects.toThrow(
      'rejected'
    );
    expect(store.getState().configurations['tenant:brand']).toEqual(DEFAULT_CHAT_CONFIGURATION);
    await store.getState().setConfiguration('tenant:brand', next);
    expect(store.getState().configurations['tenant:brand']).toEqual(next);
  });
  it('retains older chats and editable defaults when new start validation becomes stricter', async () => {
    const configuration = {
      ...DEFAULT_CHAT_CONFIGURATION,
      criteria: [{ path: '/workspace/./old-report.json', kind: 'json' as const, expected: true }],
    };
    const chat = {
      ...fixture(),
      messages: [
        {
          id: 'original-message',
          role: 'user' as const,
          content: 'Keep my original transcript',
          timestamp: 1,
        },
      ],
      durableSession: {
        version: 2 as const,
        workflowId: 'saved-workflow',
        engineUrl: 'https://engine.example',
        configuration,
      },
    };
    const scope = 'tenant:brand';
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key) =>
      key === 'computerChats' ? [chat] : { [scope]: configuration }
    );
    store.setState({ configurations: {} });
    await store.getState().initialize();
    expect(store.getState().chats).toEqual([chat]);
    expect(store.getState().configurations[scope]).toEqual(configuration);
    await store.getState().updateMetadata(chat.id, { title: 'Still accessible' });
    expect(store.getState().chats[0].messages[0].content).toBe('Keep my original transcript');
  });
  it('rejects new unsupported defaults without overwriting the existing defaults', async () => {
    const scope = 'tenant:brand';
    store.setState({ configurations: { [scope]: DEFAULT_CHAT_CONFIGURATION } });
    await expect(
      store.getState().setConfiguration(scope, {
        ...DEFAULT_CHAT_CONFIGURATION,
        criteria: [{ path: '/workspace/./report.json', kind: 'json', expected: true }],
      })
    ).rejects.toThrow('Choose a file under /workspace');
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(store.getState().configurations[scope]).toEqual(DEFAULT_CHAT_CONFIGURATION);
  });
  it('persists the last opened chat without promoting its execution activity', async () => {
    const chat = fixture();
    await store.getState().save(chat);
    await store.getState().markOpened(chat.id);
    expect(store.getState().chats[0].updatedAt).toBe(chat.updatedAt);
    const snapshot = vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1];
    expect(snapshot).toEqual([expect.objectContaining({ lastOpenedAt: expect.any(String) })]);
    vi.mocked(window.electronAPI!.store.get).mockResolvedValue(snapshot);
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    expect(store.getState().chats[0].lastOpenedAt).toBeDefined();
  });
  it('coalesces draft saves, restores each chat independently, and preserves activity ordering', async () => {
    vi.useFakeTimers();
    const first = fixture();
    const second = fixture();
    await store.getState().save(first);
    await store.getState().save(second);
    vi.mocked(window.electronAPI!.store.set).mockClear();
    store.getState().setDraft(first.id, 'Unfinished');
    store.getState().setDraft(first.id, 'Unfinished instruction');
    store.getState().setDraft(second.id, 'Different draft');
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(store.getState().chats.map((c) => c.id)).toEqual([second.id, first.id]);
    await vi.advanceTimersByTimeAsync(350);
    expect(window.electronAPI!.store.set).toHaveBeenCalledTimes(1);
    const snapshot = vi.mocked(window.electronAPI!.store.set).mock.calls[0][1];
    vi.mocked(window.electronAPI!.store.get).mockResolvedValue(snapshot);
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    expect(store.getState().chats.find((c) => c.id === first.id)).toMatchObject({
      draft: 'Unfinished instruction',
      updatedAt: first.updatedAt,
    });
    expect(store.getState().chats.find((c) => c.id === second.id)?.draft).toBe('Different draft');
  });

  it('retains a draft after storage failure and allows immediate retry', async () => {
    const chat = fixture();
    await store.getState().save(chat);
    store.getState().setDraft(chat.id, 'Keep this work');
    vi.mocked(window.electronAPI!.store.set).mockResolvedValueOnce(false);
    await expect(store.getState().flushDrafts()).rejects.toThrow('rejected');
    expect(store.getState().chats[0].draft).toBe('Keep this work');
    expect(store.getState().persistenceError).toContain('rejected');
    await store.getState().flush();
    expect(store.getState().persistenceError).toBeUndefined();
    expect(vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1]).toEqual([
      expect.objectContaining({ draft: 'Keep this work' }),
    ]);
  });
  it('restores the session and pending workflow identity after restart', async () => {
    const chat = fixture();
    chat.pending = {
      requestId: crypto.randomUUID(),
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      command: ['pwd'],
      durable: true,
      verify: true,
      engineUrl: 'https://engine.example',
      workflowId: 'existing',
      runId: 'run',
    };
    vi.mocked(window.electronAPI!.store.get).mockResolvedValue([chat]);
    await store.getState().initialize();
    expect(store.getState().chats[0]).toEqual(chat);
  });

  it('rejects stored chats with missing scope or malformed pending actions', async () => {
    const valid = fixture();
    vi.mocked(window.electronAPI!.store.get).mockResolvedValue([
      valid,
      { ...fixture(), tenantId: '' },
      { ...fixture(), pending: { action: { name: 'arbitrary_host_tool' } } },
    ]);
    await store.getState().initialize();
    expect(store.getState().chats).toEqual([valid]);
  });

  it('omits screenshot pixels and completed tool arguments/results from disk', async () => {
    const chat = fixture();
    chat.screenshot = 'data:image/png;base64,private-pixels';
    chat.messages = [
      {
        id: 'tool',
        role: 'tool',
        content: 'execute',
        timestamp: 1,
        tool: {
          name: 'execute',
          status: 'success',
          arguments: { token: 'private' },
          resultPreview: 'private result',
        },
      },
    ];
    await store.getState().save(chat);
    const serialized = JSON.stringify(vi.mocked(window.electronAPI!.store.set).mock.calls[0][1]);
    expect(serialized).not.toContain('private');
    expect(store.getState().chats[0].screenshot).toBe(chat.screenshot);
  });

  it('serializes writes so an older snapshot cannot overwrite a newer one', async () => {
    const first = fixture();
    const second = fixture();
    const completions: (() => void)[] = [];
    vi.mocked(window.electronAPI!.store.set).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          completions.push(() => resolve(true));
        })
    );
    const saveFirst = store.getState().save(first);
    const saveSecond = store.getState().save(second);
    await vi.waitFor(() => expect(completions).toHaveLength(1));
    completions[0]();
    await saveFirst;
    await vi.waitFor(() => expect(completions).toHaveLength(2));
    completions[1]();
    await saveSecond;
    const finalSnapshot = vi.mocked(window.electronAPI!.store.set).mock
      .calls[1][1] as ComputerChat[];
    expect(finalSnapshot.map((item) => item.id)).toEqual([second.id, first.id]);
  });
  it('preserves chat organization metadata and retained timeline on restart', async () => {
    const chat = {
      ...fixture(),
      pinned: true,
      archived: true,
      customTitle: true,
      historyTruncated: true,
      timeline: [{ id: 1, kind: 'action_completed', at: 1, detail: { exit_code: 0 } }],
    };
    vi.mocked(window.electronAPI!.store.get).mockResolvedValue([chat]);
    await store.getState().initialize();
    expect(store.getState().chats[0]).toEqual(chat);
  });

  it('validates names and preserves session identity during metadata changes', async () => {
    const chat = fixture();
    await store.getState().save(chat);
    await expect(store.getState().updateMetadata(chat.id, { title: '   ' })).rejects.toThrow(
      'chat name'
    );
    await store.getState().updateMetadata(chat.id, { title: '  Better name  ', pinned: true });
    expect(store.getState().chats[0]).toMatchObject({
      title: 'Better name',
      pinned: true,
      customTitle: true,
      session: chat.session,
    });
    expect(store.getState().chats[0].updatedAt).toBe(chat.updatedAt);
  });
  it('retains unsaved changes in memory and exposes storage failures until a retry succeeds', async () => {
    const chat = fixture();
    vi.mocked(window.electronAPI!.store.set).mockRejectedValueOnce(new Error('Storage is full'));
    await expect(store.getState().save(chat)).rejects.toThrow('Storage is full');
    expect(store.getState().chats[0].id).toBe(chat.id);
    expect(store.getState().persistenceError).toBe('Storage is full');
    await store.getState().flush();
    expect(store.getState().persistenceError).toBeUndefined();
    expect(vi.mocked(window.electronAPI!.store.set).mock.calls[1][1]).toEqual(
      vi.mocked(window.electronAPI!.store.set).mock.calls[0][1]
    );
  });
});
