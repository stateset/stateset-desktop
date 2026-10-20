/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputerChatsStore } from './store';
import { computerChatRuntime } from './runtime';
import { computerSessionApi, computerWorkflowApi, evaluateAction, requirePolicyKey } from './api';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import type { ComputerChat, PendingAction, PolicyReceipt } from './types';
import { SandboxRequestError } from '../../lib/sandbox';
import { ChatIssueError } from './chatIssue';
import { checkSandboxArtifact, type SandboxArtifactReceipt } from './sandboxArtifact';

vi.mock('./sandboxArtifact', async (original) => ({
  ...(await original<typeof import('./sandboxArtifact')>()),
  checkSandboxArtifact: vi.fn(),
}));

vi.mock('./api', async (original) => {
  const actual = await original<typeof import('./api')>();
  return {
    ...actual,
    computerSessionApi: {
      create: vi.fn(),
      get: vi.fn(),
      start: vi.fn(),
      execute: vi.fn(),
      infer: vi.fn(),
      stop: vi.fn(),
      sandboxStopped: vi.fn(),
      stopSandbox: vi.fn(),
    },
    computerWorkflowApi: { start: vi.fn(), status: vi.fn(), cancel: vi.fn() },
    evaluateAction: vi.fn(),
    requirePolicyKey: vi.fn(),
  };
});

const options = { durable: true, verify: true, model: 'claude-sonnet-4-6' };
const session = {
  id: 'session-1',
  organizationId: 'sandbox-org',
  status: 'running',
  currentSandboxId: 'sandbox-1',
};
const result = { exitCode: 0, stdout: 'observed output', stderr: '', outputTruncated: false };
const computer = {
  sessionId: session.id,
  sandboxId: session.currentSandboxId,
  organizationId: session.organizationId,
};
const receipt: PolicyReceipt = {
  phase: 'verification',
  verdict: 'allow',
  actionHash: 'hash',
  evidenceIds: ['evidence'],
  reasons: [],
  checkedAt: '2026-10-14',
};
const store = useComputerChatsStore;
const fileReceipt: SandboxArtifactReceipt = {
  requestId: '11111111-1111-4111-8111-111111111111',
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  organizationId: 'sandbox-org',
  checkedAt: '2026-10-19T00:00:00Z',
  path: '/workspace/report.txt',
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  kind: 'contains',
  criterionSha256: 'b'.repeat(64),
  verification: {
    verified: true,
    outcome: 'verified',
    manifest_sha256: 'c'.repeat(64),
    checks: [
      {
        path: '/workspace/report.txt',
        kind: 'contains',
        passed: true,
        detail: 'Matched',
        sha256: 'a'.repeat(64),
      },
    ],
    evidence_ids: ['evidence'],
  },
};
const read = (id: string) => store.getState().chats.find((chat) => chat.id === id)!;

async function chat(): Promise<string> {
  const id = await computerChatRuntime.create('tenant-1', 'brand-1');
  await computerChatRuntime.provision(id);
  return id;
}

function toolResponse() {
  return {
    content: [
      {
        type: 'tool_use' as const,
        id: 'call-1',
        name: 'execute',
        input: { command: ['cat', '/workspace/notes.txt'] },
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.electronAPI = {
    store: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) },
  } as unknown as typeof window.electronAPI;
  store.setState({ chats: [], busy: {}, activities: {}, loaded: true });
  useAuthStore.setState({
    tenant: { id: 'tenant-1' } as never,
    currentBrand: { id: 'brand-1' } as never,
    sandboxApiKey: 'sandbox-key',
  });
  useDurableWorkflowsStore.setState({
    engineUrl: 'https://workflows.example',
    apiKey: 'engine-key',
  });
  vi.mocked(computerSessionApi.create).mockResolvedValue({ ...session, status: 'pending' });
  vi.mocked(computerSessionApi.start).mockResolvedValue(session);
  vi.mocked(computerSessionApi.get).mockResolvedValue(session);
  vi.mocked(computerSessionApi.execute).mockResolvedValue(result);
  vi.mocked(computerSessionApi.sandboxStopped).mockResolvedValue(true);
  vi.mocked(computerSessionApi.stop).mockImplementation(async () => {
    vi.mocked(computerSessionApi.get).mockResolvedValue({ ...session, status: 'completed' });
  });
  vi.mocked(computerSessionApi.infer).mockResolvedValue({
    content: [{ type: 'text', text: 'Done.' }],
  });
  vi.mocked(computerWorkflowApi.start).mockResolvedValue({
    workflow_id: 'workflow-1',
    run_id: 'run-1',
  });
  vi.mocked(computerWorkflowApi.status).mockResolvedValue({ status: 'completed', result });
  vi.mocked(evaluateAction).mockResolvedValue(receipt);
  vi.mocked(requirePolicyKey).mockResolvedValue('policy-key');
});

describe('computer chat lifecycle', () => {
  it.each([
    {
      label: 'path traversal',
      path: '/workspace/../private',
      kind: 'contains' as const,
      expected: 'proof',
    },
    {
      label: 'invalid digest',
      path: '/workspace/proof',
      kind: 'sha256' as const,
      expected: 'invalid',
    },
    {
      label: 'oversized expectation',
      path: '/workspace/proof',
      kind: 'contains' as const,
      expected: '\u0001'.repeat(3000),
    },
  ])('rejects $label before any status or evidence request', async (input) => {
    const id = await chat();
    store.getState().setDraft(id, 'Retain my draft');
    vi.mocked(computerSessionApi.get).mockClear();
    await computerChatRuntime.verifyArtifact(id, input);
    expect(computerSessionApi.get).not.toHaveBeenCalled();
    expect(checkSandboxArtifact).not.toHaveBeenCalled();
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    expect(read(id)).toMatchObject({ draft: 'Retain my draft', session });
    expect(read(id).error).toBeTruthy();
  });
  it('saves unfinished work before inference and reopens it without resubmitting the task', async () => {
    const id = await chat();
    store.getState().setDraft(id, 'Original task');
    let finish!: () => void;
    vi.mocked(computerSessionApi.infer).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          const saved = vi.mocked(window.electronAPI!.store.set).mock
            .lastCall?.[1] as ComputerChat[];
          expect(saved.find((item) => item.id === id)).toMatchObject({
            agentTurnUnfinished: true,
            messages: [expect.objectContaining({ role: 'user', content: 'Original task' })],
          });
          finish = () => resolve({ content: [{ type: 'text', text: 'Finished.' }] });
        })
    );
    const sending = computerChatRuntime.send(id, 'Original task', options);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    // Restore exactly the durable state that an interrupted process would leave.
    const interrupted = structuredClone(
      vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1]
    );
    finish();
    await sending;
    expect(read(id).agentTurnUnfinished).toBeUndefined();
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key) =>
      key === 'computerChats' ? interrupted : undefined
    );
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    expect(read(id).agentTurnUnfinished).toBe(true);
    await computerChatRuntime.refresh(id);
    expect(read(id).agentTurnUnfinished).toBe(true);
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    expect(computerSessionApi.create).toHaveBeenCalledOnce();
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
    await computerChatRuntime.send(id, 'Continue the saved task', options);
    expect(computerSessionApi.infer).toHaveBeenCalledTimes(2);
    expect(
      read(id)
        .messages.filter((item) => item.role === 'user')
        .map((item) => item.content)
    ).toEqual(['Original task', 'Continue the saved task']);
    expect(read(id).agentTurnUnfinished).toBeUndefined();
  });
  it('does not begin inference if the unfinished task cannot be saved', async () => {
    const id = await chat();
    store.getState().setDraft(id, 'Retain this draft');
    vi.mocked(window.electronAPI!.store.set).mockImplementation(
      async (_key, value) => !(value as ComputerChat[]).some((item) => item.agentTurnUnfinished)
    );
    await computerChatRuntime.send(id, 'Retain this draft', options);
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    expect(read(id).messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Retain this draft' }),
    ]);
    expect(read(id).draft).toBe('Retain this draft');
    expect(read(id).agentTurnUnfinished).toBe(true);
    expect(store.getState().persistenceError).toContain('Desktop storage rejected the save');
  });
  it('keeps unfinished work after model and cleanup errors until shutdown is confirmed', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockRejectedValueOnce(new Error('Inference unavailable'));
    await computerChatRuntime.send(id, 'Prepare the report', options);
    expect(read(id)).toMatchObject({ agentTurnUnfinished: true, error: 'Inference unavailable' });
    vi.mocked(computerSessionApi.sandboxStopped).mockRejectedValueOnce(
      new Error('Cleanup unavailable')
    );
    await computerChatRuntime.stop(id);
    expect(read(id).agentTurnUnfinished).toBe(true);
    expect(read(id).stopped).not.toBe(true);
    await computerChatRuntime.stop(id);
    expect(read(id).agentTurnUnfinished).toBeUndefined();
    expect(read(id).stopped).toBe(true);
  });
  it('retains the source of a model failure across a read-only refresh and clears it only for new work', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockRejectedValueOnce(
      new ChatIssueError('provider-credit', 'Insufficient credits')
    );
    await computerChatRuntime.send(id, 'Prepare the report', options);
    expect(read(id)).toMatchObject({
      error: 'Insufficient credits',
      errorCode: 'provider-credit',
      agentTurnUnfinished: true,
    });
    await computerChatRuntime.refresh(id);
    expect(read(id).errorCode).toBe('provider-credit');
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    await computerChatRuntime.send(id, 'Continue after credits were restored', options);
    expect(read(id).errorCode).toBeUndefined();
    expect(read(id).error).toBeUndefined();
    expect(computerSessionApi.infer).toHaveBeenCalledTimes(2);
  });
  it.each([
    { label: 'distinct', replacement: 'replacement-private-key' },
    { label: 'overlapping', replacement: 'original-private-key-replacement' },
  ])(
    'bounds upstream error details and redacts $label request-start and current Sandbox keys before saving',
    async ({ replacement }) => {
      useAuthStore.setState({ sandboxApiKey: 'original-private-key' });
      const id = await chat();
      vi.mocked(computerSessionApi.infer).mockImplementationOnce(async () => {
        useAuthStore.setState({ sandboxApiKey: replacement });
        throw new ChatIssueError(
          'provider-unavailable',
          `original-private-key ${replacement} ${'x'.repeat(10000)}`
        );
      });
      await computerChatRuntime.send(id, 'Prepare the report', options);
      expect(read(id)).toMatchObject({
        errorCode: 'provider-unavailable',
        agentTurnUnfinished: true,
        session,
      });
      expect(read(id).error).toContain('[redacted] [redacted]');
      expect(read(id).error).not.toContain('original-private-key');
      expect(read(id).error).not.toContain(replacement);
      expect(read(id).error!.length).toBeLessThanOrEqual(2001);
      const writes = vi.mocked(window.electronAPI!.store.set).mock.calls;
      expect(JSON.stringify(writes)).not.toContain('original-private-key');
      expect(JSON.stringify(writes)).not.toContain(replacement);
      expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    }
  );
  it.each([false, true])(
    'settles the submitted draft after a paused transcript save while preserving newer edits (%s)',
    async (edited) => {
      const id = await chat();
      store.getState().setDraft(id, 'Original task');
      let release!: () => void;
      vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, snapshot) => {
        if (
          !release &&
          (snapshot as ComputerChat[])[0]?.messages.some(
            (message) => message.role === 'user' && message.content === 'Original task'
          )
        )
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return true;
      });
      const send = computerChatRuntime.send(id, 'Original task', options);
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      computerChatRuntime.pause(id);
      if (edited) store.getState().setDraft(id, 'Next task');
      release();
      await send;
      expect(read(id).messages.filter((message) => message.role === 'user')).toEqual([
        expect.objectContaining({ content: 'Original task' }),
      ]);
      expect(read(id).draft).toBe(edited ? 'Next task' : '');
      expect(read(id).pauseNotice).toContain('Work paused.');
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
      expect(computerWorkflowApi.start).not.toHaveBeenCalled();
    }
  );
  it.each([
    'initial save',
    'create intent',
    'create intent after uncertain create',
    'start intent',
  ] as const)('stops setup before the next request when paused during %s', async (stage) => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    if (stage === 'create intent after uncertain create')
      await store.getState().save({ ...read(id), provisioningAttempted: true });
    store.getState().setDraft(id, 'Keep my task');
    let release!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, snapshot) => {
      const saved = (snapshot as ComputerChat[])[0];
      const match =
        stage === 'initial save' ||
        (stage.startsWith('create intent') && saved.provisioningAttempted && !saved.session) ||
        (stage === 'start intent' && saved.sandboxStartUnconfirmed);
      if (!release && match)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return true;
    });
    const setup = computerChatRuntime.provision(id);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    computerChatRuntime.pause(id);
    release();
    await setup;
    expect(computerSessionApi.create).toHaveBeenCalledTimes(stage === 'start intent' ? 1 : 0);
    expect(computerSessionApi.start).not.toHaveBeenCalled();
    expect(read(id).sandboxStartUnconfirmed).not.toBe(true);
    if (stage.startsWith('create intent'))
      expect(read(id).provisioningAttempted).toBe(stage === 'create intent after uncertain create');
    expect(read(id).draft).toBe('Keep my task');
    expect(read(id).pauseNotice).toContain('Computer setup paused.');
    expect(store.getState().busy[id]).toBe(false);
    expect(store.getState().activities[id]).toBeUndefined();
  });

  it('retains a delayed created session after pause without starting its computer', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    let resolve!: (value: typeof session) => void;
    vi.mocked(computerSessionApi.create).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const setup = computerChatRuntime.provision(id);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    computerChatRuntime.pause(id);
    expect(store.getState().activities[id]).toEqual({ kind: 'setup', pausing: true });
    store.getState().setDraft(id, 'Draft during pause');
    resolve({ ...session, status: 'pending' });
    await setup;
    expect(read(id).session?.id).toBe(session.id);
    expect(read(id).draft).toBe('Draft during pause');
    expect(computerSessionApi.start).not.toHaveBeenCalled();
    expect(read(id).error).toBeUndefined();
    expect(read(id).pauseNotice).toContain('Computer setup paused.');
  });

  it('retains a startup acknowledgement after pause and allows explicit cleanup of its original computer', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    let resolve!: (value: typeof session) => void;
    vi.mocked(computerSessionApi.start).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const setup = computerChatRuntime.provision(id);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    computerChatRuntime.pause(id);
    resolve(session);
    await setup;
    expect(read(id)).toMatchObject({
      session,
      sandboxCleanupIds: ['sandbox-1'],
      sandboxStartUnconfirmed: false,
    });
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    expect(computerSessionApi.stop).not.toHaveBeenCalled();
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.stop).toHaveBeenCalledExactlyOnceWith(session.id);
    expect(read(id).stopped).toBe(true);
    expect(read(id).pauseNotice).toBeUndefined();
  });

  it.each(['tool', 'text'] as const)(
    'discards a late %s model reply after pause without preparing another action or accepting completion',
    async (reply) => {
      const id = await chat();
      let resolve!: (value: Awaited<ReturnType<typeof computerSessionApi.infer>>) => void;
      vi.mocked(computerSessionApi.infer).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      const send = computerChatRuntime.send(id, 'Original task', options);
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      computerChatRuntime.pause(id);
      store.getState().setDraft(id, 'Next task');
      resolve(
        reply === 'tool'
          ? toolResponse()
          : { content: [{ type: 'text', text: 'This task is complete.' }] }
      );
      await send;
      expect(read(id).pending).toBeUndefined();
      expect(read(id).draft).toBe('Next task');
      expect(read(id).pauseNotice).toContain('Work paused.');
      expect(read(id).messages.filter((message) => message.role === 'assistant')).toEqual([]);
      expect(computerSessionApi.execute).not.toHaveBeenCalled();
      expect(computerWorkflowApi.start).not.toHaveBeenCalled();
      expect(evaluateAction).not.toHaveBeenCalled();
      expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    }
  );

  it('retains an execution receipt returned after pause for verification without repeating the action', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    let resolve!: (value: typeof result) => void;
    vi.mocked(computerSessionApi.execute).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const send = computerChatRuntime.send(id, 'Read notes', { ...options, durable: false });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const requestId = read(id).pending!.requestId;
    computerChatRuntime.pause(id);
    vi.mocked(computerSessionApi.get).mockClear();
    resolve(result);
    await send;
    expect(read(id).pending).toMatchObject({ requestId, result });
    expect(read(id).pauseNotice).toContain('Conversation paused.');
    expect(computerSessionApi.get).not.toHaveBeenCalled();
    expect(evaluateAction).toHaveBeenCalledOnce();
    await computerChatRuntime.resume(id);
    expect(computerSessionApi.execute).toHaveBeenCalledOnce();
    expect(read(id).pending).toBeUndefined();
    expect(read(id).pauseNotice).toBeUndefined();
  });

  it('keeps shutdown active when pause is requested, and completes cleanup once', async () => {
    const id = await chat();
    let finish!: () => void;
    vi.mocked(computerSessionApi.stop).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            vi.mocked(computerSessionApi.get).mockResolvedValue({
              ...session,
              status: 'completed',
            });
            resolve();
          };
        })
    );
    const stop = computerChatRuntime.stop(id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    computerChatRuntime.pause(id);
    expect(store.getState().activities[id]).toEqual({ kind: 'shutdown', pausing: false });
    finish();
    await stop;
    expect(read(id).stopped).toBe(true);
    expect(read(id).pauseNotice).toBeUndefined();
    expect(computerSessionApi.stop).toHaveBeenCalledOnce();
  });

  it.each(['status', 'receipt'] as const)(
    'honors pause during a file-check %s without accepting a late report',
    async (stage) => {
      const id = await chat();
      let finish!: () => void;
      if (stage === 'status')
        vi.mocked(computerSessionApi.get).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(session);
            })
        );
      else
        vi.mocked(checkSandboxArtifact).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(fileReceipt);
            })
        );
      const check = computerChatRuntime.verifyArtifact(id, {
        path: '/workspace/report.txt',
        kind: 'contains',
        expected: 'test',
      });
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      computerChatRuntime.pause(id);
      finish();
      await check;
      expect(checkSandboxArtifact).toHaveBeenCalledTimes(stage === 'status' ? 0 : 1);
      expect(read(id).artifactVerification).toBeUndefined();
      expect(read(id).pauseNotice).toContain('Work paused.');
    }
  );

  it.each(['session', 'organization'] as const)(
    'rejects a foreign %s in shutdown status without stopping its computer',
    async (changed) => {
      const id = await chat();
      vi.mocked(computerSessionApi.stop).mockImplementationOnce(async () => {
        vi.mocked(computerSessionApi.get).mockResolvedValue({
          ...session,
          status: 'completed',
          currentSandboxId: 'foreign-computer',
          ...(changed === 'session'
            ? { id: 'foreign-session' }
            : { organizationId: 'foreign-organization' }),
        });
      });
      await computerChatRuntime.stop(id);
      expect(read(id).session).toEqual(session);
      expect(read(id).sandboxCleanupIds).toEqual(['sandbox-1']);
      expect(read(id).sandboxStopRequested).toBe(true);
      expect(read(id).stopped).not.toBe(true);
      expect(read(id).error).toContain('different session identity');
      expect(computerSessionApi.sandboxStopped).not.toHaveBeenCalled();
      expect(computerSessionApi.stopSandbox).not.toHaveBeenCalled();
    }
  );
  it.each(['', '漢'.repeat(86)])(
    'rejects invalid model names before computer access or draft submission (%s)',
    async (model) => {
      const id = await chat();
      store.getState().setDraft(id, 'Keep my task');
      vi.mocked(computerSessionApi.get).mockClear();
      await computerChatRuntime.send(id, 'Keep my task', { ...options, model });
      expect(read(id).messages).toEqual([]);
      expect(read(id).draft).toBe('Keep my task');
      expect(read(id).error).toMatch(/model name/);
      expect(computerSessionApi.get).not.toHaveBeenCalled();
      expect(requirePolicyKey).not.toHaveBeenCalled();
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
    }
  );
  it('clears an unchanged legacy draft only after retaining its submitted message', async () => {
    const id = await chat();
    await store.getState().save({ ...read(id), draft: 'Original task' });
    vi.mocked(computerSessionApi.infer).mockImplementationOnce(async () => {
      expect(read(id).draft).toBe('');
      expect(read(id).messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Original task' }),
      ]);
      return { content: [{ type: 'text', text: 'Done.' }] };
    });
    await computerChatRuntime.send(id, 'Original task', options);
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
  });

  it.each(['new text', 'same text retyped'] as const)(
    'retains %s drafted during the credential preflight without automatically submitting it',
    async (edit) => {
      const id = await chat();
      store.getState().setDraft(id, 'Original task');
      vi.mocked(requirePolicyKey).mockImplementationOnce(async () => {
        store.getState().setDraft(id, 'Next task');
        if (edit === 'same text retyped') store.getState().setDraft(id, 'Original task');
        return 'policy-key';
      });
      await computerChatRuntime.send(id, 'Original task', options);
      expect(read(id).draft).toBe(edit === 'new text' ? 'Next task' : 'Original task');
      expect(read(id).messages.filter((message) => message.role === 'user')).toEqual([
        expect.objectContaining({ content: 'Original task' }),
      ]);
      expect(computerSessionApi.infer).toHaveBeenCalledOnce();
      expect(vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1]).toEqual([
        expect.objectContaining({ draft: read(id).draft, draftRevision: read(id).draftRevision }),
      ]);
    }
  );

  it('preserves a new draft while the submitted transcript write is awaiting acknowledgement', async () => {
    const id = await chat();
    store.getState().setDraft(id, 'Original task');
    let release!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, snapshot) => {
      if (
        !release &&
        (snapshot as ComputerChat[])[0]?.messages.some(
          (message) => message.role === 'user' && message.content === 'Original task'
        )
      )
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return true;
    });
    const send = computerChatRuntime.send(id, 'Original task', options);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    try {
      store.getState().setDraft(id, 'Next task');
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
    } finally {
      release();
      await send;
    }
    expect(read(id).draft).toBe('Next task');
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
  });

  it('keeps the next draft after inference fails and does not submit it as a follow-up', async () => {
    const id = await chat();
    store.getState().setDraft(id, 'Original task');
    vi.mocked(computerSessionApi.infer).mockImplementationOnce(async () => {
      store.getState().setDraft(id, 'Next task');
      throw new Error('Inference unavailable');
    });
    await computerChatRuntime.send(id, 'Original task', options);
    expect(read(id)).toMatchObject({ draft: 'Next task', error: 'Inference unavailable' });
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    expect(read(id).messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });
  it('persists only a receipt and prevents a pending check from overlapping agent work', async () => {
    const id = await chat();
    let finish!: () => void;
    vi.mocked(checkSandboxArtifact).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(fileReceipt);
        })
    );
    const check = computerChatRuntime.verifyArtifact(id, {
      path: '/workspace/report.txt',
      kind: 'contains',
      expected: 'private expected bytes',
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await computerChatRuntime.send(id, 'run another action', options);
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    finish();
    await check;
    expect(read(id).artifactVerification).toEqual(fileReceipt);
    const snapshot = vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1];
    expect(JSON.stringify(snapshot)).not.toContain('private expected bytes');
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key) =>
      key === 'computerChats' ? snapshot : undefined
    );
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    expect(read(id).artifactVerification).toEqual(fileReceipt);
  });

  it('marks a file receipt outdated before subsequent computer actions can run', async () => {
    const id = await chat();
    await store.getState().save({ ...read(id), artifactVerification: fileReceipt });
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(computerSessionApi.execute).mockImplementation(async () => {
      expect(read(id).artifactVerification?.outdated).toBe(true);
      return result;
    });
    await computerChatRuntime.send(id, 'write a new report', {
      ...options,
      durable: false,
      verify: false,
    });
    expect(read(id).artifactVerification?.outdated).toBe(true);
  });

  it('discards a file receipt when the connection changes while checking', async () => {
    const id = await chat();
    vi.mocked(checkSandboxArtifact).mockImplementation(async () => {
      useAuthStore.setState({ sandboxApiKey: 'different-key' });
      return fileReceipt;
    });
    await computerChatRuntime.verifyArtifact(id, {
      path: '/workspace/report.txt',
      kind: 'contains',
      expected: 'proof',
    });
    expect(read(id).artifactVerification).toBeUndefined();
    expect(read(id).error).toContain('connection changed');
  });

  it('retries owned computer shutdown when the ended session left compute running', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.sandboxStopped)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.stopSandbox).toHaveBeenCalledOnce();
    expect(computerSessionApi.stopSandbox).toHaveBeenCalledWith('sandbox-1');
    expect(computerSessionApi.sandboxStopped).toHaveBeenCalledTimes(2);
    expect(read(id).stopped).toBe(true);
  });

  it('retains cleanup identities after a terminal refresh and reload', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.get).mockResolvedValue({
      ...session,
      status: 'completed',
      currentSandboxId: null,
    });
    await computerChatRuntime.refresh(id);
    const snapshot = vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1];
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key) =>
      key === 'computerChats' ? snapshot : undefined
    );
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    vi.mocked(computerSessionApi.sandboxStopped).mockRejectedValueOnce(
      new Error('cleanup unavailable')
    );
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.sandboxStopped).toHaveBeenCalledWith('sandbox-1');
    expect(read(id).stopped).not.toBe(true);
    expect(read(id).sandboxStopRequested).toBe(true);
    await computerChatRuntime.stop(id);
    expect(read(id).stopped).toBe(true);
    expect(read(id).sandboxCleanupIds).toEqual(['sandbox-1']);
  });

  it('checks every observed computer when a session rotates', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.get).mockResolvedValue({
      ...session,
      currentSandboxId: 'sandbox-2',
    });
    await computerChatRuntime.refresh(id);
    vi.mocked(computerSessionApi.sandboxStopped).mockImplementation(async (sandboxId) => {
      if (sandboxId === 'sandbox-2') throw new Error('second computer still exists');
      return true;
    });
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.sandboxStopped).toHaveBeenCalledWith('sandbox-1');
    expect(computerSessionApi.sandboxStopped).toHaveBeenCalledWith('sandbox-2');
    expect(read(id).stopped).not.toBe(true);
  });

  it('uses a computer identity discovered while reconciling an uncertain startup', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.create).mockResolvedValueOnce({
      ...session,
      status: 'pending',
      currentSandboxId: null,
    });
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(
      new Error('lost start acknowledgement')
    );
    await computerChatRuntime.provision(id);
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.sandboxStopped).toHaveBeenCalledWith('sandbox-1');
    expect(read(id).stopped).toBe(true);
  });

  it('does not declare older terminal sessions cleaned when their computer identity is missing', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.stop).mockResolvedValue(undefined);
    vi.mocked(computerSessionApi.get).mockResolvedValue({
      ...session,
      status: 'completed',
      currentSandboxId: null,
    });
    await store
      .getState()
      .save({ ...read(id), session: { ...session, status: 'completed', currentSandboxId: null } });
    await computerChatRuntime.stop(id);
    expect(read(id).stopped).not.toBe(true);
    expect(read(id).error).toContain('cleanup still needs inspection');
  });

  it('includes bounded untrusted tool observations in follow-ups without persisting raw output', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    await computerChatRuntime.send(id, 'read my notes', { ...options, durable: false });
    await computerChatRuntime.send(id, 'what did the command return?', {
      ...options,
      durable: false,
    });
    const followup = vi.mocked(computerSessionApi.infer).mock.calls[2][1];
    expect(JSON.stringify(followup)).toContain('observed output');
    expect(JSON.stringify(followup)).toContain('computer_observation');
    const snapshot = vi.mocked(window.electronAPI!.store.set).mock.lastCall?.[1] as ComputerChat[];
    expect(JSON.stringify(snapshot)).not.toContain('observed output');
    expect(computerSessionApi.execute).toHaveBeenCalledOnce();
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key) =>
      key === 'computerChats' ? snapshot : undefined
    );
    store.setState({ chats: [], loaded: false });
    await store.getState().initialize();
    await computerChatRuntime.send(id, 'continue after reopening', { ...options, durable: false });
    expect(JSON.stringify(vi.mocked(computerSessionApi.infer).mock.lastCall?.[1])).toContain(
      'Earlier output is unavailable'
    );
    expect(computerSessionApi.execute).toHaveBeenCalledOnce();
  });

  it('requires an observation visible to the new model turn before GUI actions', async () => {
    const id = await chat();
    await store.getState().save({ ...read(id), screenshot: 'data:image/png;base64,iVBORold' });
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'call-new', name: 'click', input: { x: 1, y: 2 } }],
    });
    await computerChatRuntime.send(id, 'click the next button', options);
    expect(computerWorkflowApi.start).not.toHaveBeenCalled();
    expect(read(id).error).toContain('fresh screenshot');
  });

  it('keeps an unconfirmed shutdown recoverable and blocks subsequent actions', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.sandboxStopped).mockRejectedValueOnce(
      new Error('cleanup status unavailable')
    );
    await computerChatRuntime.stop(id);
    expect(read(id).stopped).not.toBe(true);
    expect(read(id).sandboxStopRequested).toBe(true);
    await computerChatRuntime.send(id, 'more work', options);
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    await computerChatRuntime.stop(id);
    expect(read(id).stopped).toBe(true);
    expect(computerSessionApi.create).toHaveBeenCalledOnce();
  });
  it('reconciles an unconfirmed start without submitting another start request', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(new Error('connection lost'));
    await computerChatRuntime.provision(id);
    expect(read(id).sandboxStartUnconfirmed).toBe(true);
    vi.mocked(computerSessionApi.get).mockResolvedValueOnce({
      ...session,
      status: 'pending',
      currentSandboxId: null,
    });
    await computerChatRuntime.provision(id);
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
    expect(read(id).error).toContain('startup is unconfirmed');
    await computerChatRuntime.provision(id);
    expect(read(id).session?.status).toBe('running');
    expect(read(id).sandboxStartUnconfirmed).toBe(false);
    expect(computerSessionApi.create).toHaveBeenCalledOnce();
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
  });
  it('does not allocate a second session during overlapping background setup', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    let finish!: () => void;
    vi.mocked(computerSessionApi.create).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ...session, status: 'pending' });
        })
    );
    const first = computerChatRuntime.provision(id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await computerChatRuntime.provision(id);
    finish();
    await first;
    expect(computerSessionApi.create).toHaveBeenCalledOnce();
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
  });

  it('keeps the returned identity but does not start it under a changed API key', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.create).mockImplementationOnce(async () => {
      useAuthStore.setState({ sandboxApiKey: 'different-key' });
      return { ...session, status: 'pending' };
    });
    await computerChatRuntime.provision(id);
    expect(read(id).session?.id).toBe(session.id);
    expect(read(id).error).toContain('connection changed');
    expect(computerSessionApi.start).not.toHaveBeenCalled();
  });
  it('creates distinct sessions for new chats and retains saved session identities', async () => {
    const first = await chat();
    vi.mocked(computerSessionApi.create).mockResolvedValueOnce({
      ...session,
      id: 'session-2',
      status: 'pending',
    });
    vi.mocked(computerSessionApi.start).mockResolvedValueOnce({
      ...session,
      id: 'session-2',
      currentSandboxId: 'sandbox-2',
    });
    const second = await chat();
    expect(first).not.toBe(second);
    expect(read(first).session?.id).toBe('session-1');
    expect(read(second).session?.id).toBe('session-2');
    await computerChatRuntime.send(first, 'hello', options);
    expect(computerSessionApi.create).toHaveBeenCalledTimes(2);
    expect(read(second).messages).toEqual([]);
  });

  it('retains a created identity if starting its sandbox fails', async () => {
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(
      new SandboxRequestError('start unavailable', 429)
    );
    const id = await chat();
    expect(read(id).session?.id).toBe('session-1');
    expect(read(id).error).toBe('start unavailable');
    await computerChatRuntime.provision(id);
    expect(computerSessionApi.create).toHaveBeenCalledTimes(1);
    expect(read(id).session?.status).toBe('running');
  });

  it('executes admitted actions through Temporal and verifies observed outputs', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    await computerChatRuntime.send(id, 'read my notes', options);
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
    expect(computerWorkflowApi.start).toHaveBeenCalledOnce();
    expect(evaluateAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id }),
      expect.objectContaining({ name: 'execute' }),
      undefined,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        assertCurrent: expect.any(Function),
      })
    );
    expect(evaluateAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id }),
      expect.objectContaining({ name: 'execute' }),
      result,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        assertCurrent: expect.any(Function),
      })
    );
    expect(read(id)).toMatchObject({
      pending: undefined,
      workflows: [{ workflowId: 'workflow-1', runId: 'run-1' }],
      policy: receipt,
    });
    expect(read(id).messages[read(id).messages.length - 1]?.content).toBe('Done.');
  });

  it.each(['deny', 'ask_user', 'rewrite'] as const)(
    'does not execute a policy %s',
    async (verdict) => {
      const id = await chat();
      vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
      vi.mocked(evaluateAction).mockResolvedValueOnce({ ...receipt, phase: 'admission', verdict });
      await computerChatRuntime.send(id, 'do work', options);
      expect(computerWorkflowApi.start).not.toHaveBeenCalled();
      expect(computerSessionApi.execute).not.toHaveBeenCalled();
      expect(read(id).error).toContain(`Policy ${verdict}`);
      expect(read(id).pending).toBeUndefined();
    }
  );

  it('retries verification without repeating completed actions', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(evaluateAction)
      .mockResolvedValueOnce({ ...receipt, phase: 'admission' })
      .mockRejectedValueOnce(new Error('NSR unavailable'));
    await computerChatRuntime.send(id, 'do work', options);
    expect(read(id).pending?.result).toEqual(result);
    expect(read(id).error).toBe('NSR unavailable');
    await computerChatRuntime.resume(id);
    expect(computerWorkflowApi.start).toHaveBeenCalledTimes(1);
    expect(computerWorkflowApi.status).toHaveBeenCalledTimes(1);
    expect(read(id).pending).toBeUndefined();
  });

  it('reuses the request ID after a lost workflow acknowledgement', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(computerWorkflowApi.start).mockRejectedValueOnce(new Error('connection lost'));
    await computerChatRuntime.send(id, 'do work', options);
    const requestId = read(id).pending?.requestId;
    expect(requestId).toBeTruthy();
    await computerChatRuntime.resume(id);
    expect(
      vi.mocked(computerWorkflowApi.start).mock.calls.map(([, pending]) => pending.requestId)
    ).toEqual([requestId, requestId]);
  });

  it('blocks a new send while an action is pending', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(computerWorkflowApi.start).mockRejectedValueOnce(new Error('connection lost'));
    await computerChatRuntime.send(id, 'do work', options);
    const count = read(id).messages.length;
    await computerChatRuntime.send(id, 'another action', options);
    expect(read(id).messages).toHaveLength(count);
    expect(computerSessionApi.infer).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping sends to one chat', async () => {
    const id = await chat();
    let finish!: (value: { content: [] }) => void;
    vi.mocked(computerSessionApi.infer).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = computerChatRuntime.send(id, 'first', options);
    await vi.waitFor(() => expect(computerSessionApi.infer).toHaveBeenCalledOnce());
    await computerChatRuntime.send(id, 'duplicate', options);
    expect(read(id).messages.filter((item) => item.role === 'user')).toHaveLength(1);
    finish({ content: [] });
    await first;
  });

  it('does not access another tenant’s session after an account switch', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.get).mockClear();
    useAuthStore.setState({ tenant: { id: 'tenant-2' } as never });
    await computerChatRuntime.send(id, 'do work', options);
    expect(computerSessionApi.get).not.toHaveBeenCalled();
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
  });

  it('preserves a session acknowledgement if the account changes during creation', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.create).mockImplementationOnce(async () => {
      useAuthStore.setState({ tenant: { id: 'tenant-2' } as never });
      return { ...session, status: 'pending' };
    });
    await computerChatRuntime.provision(id);
    expect(read(id).session?.id).toBe('session-1');
    expect(computerSessionApi.start).not.toHaveBeenCalled();
  });

  it('retains an execution receipt across an account switch for later verification', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(computerSessionApi.execute).mockImplementationOnce(async () => {
      useAuthStore.setState({ tenant: { id: 'tenant-2' } as never });
      return result;
    });
    await computerChatRuntime.send(id, 'do work', { ...options, durable: false });
    expect(read(id).pending?.result).toEqual(result);
    expect(evaluateAction).toHaveBeenCalledTimes(1);
    useAuthStore.setState({ tenant: { id: 'tenant-1' } as never });
    await computerChatRuntime.resume(id);
    expect(computerSessionApi.execute).toHaveBeenCalledTimes(1);
    expect(read(id).pending).toBeUndefined();
  });

  it('recovers a lost session creation acknowledgement before stopping', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.create).mockRejectedValueOnce(new Error('lost acknowledgement'));
    await computerChatRuntime.provision(id);
    expect(read(id).provisioningAttempted).toBe(true);
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.create).toHaveBeenNthCalledWith(1, id);
    expect(computerSessionApi.create).toHaveBeenNthCalledWith(2, id);
    expect(computerSessionApi.stop).toHaveBeenCalledWith('session-1');
    expect(read(id).stopped).toBe(true);
  });

  it('requires a new screenshot before GUI mutations', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'call', name: 'click', input: { x: 1, y: 2 } }],
    });
    await computerChatRuntime.send(id, 'click', options);
    expect(computerWorkflowApi.start).not.toHaveBeenCalled();
    expect(read(id).error).toContain('fresh screenshot');
  });

  it('stops the sandbox and prevents restarting a stopped chat', async () => {
    const id = await chat();
    await computerChatRuntime.stop(id);
    expect(computerSessionApi.stop).toHaveBeenCalledWith('session-1');
    await computerChatRuntime.send(id, 'restart', options);
    expect(computerSessionApi.create).toHaveBeenCalledTimes(1);
    expect(read(id).stopped).toBe(true);
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
  });

  it('persists action intent before the workflow can be submitted', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(window.electronAPI!.store.set).mockImplementation(async (_key, value) => {
      if ((value as ComputerChat[]).some((item) => item.pending)) throw new Error('disk full');
      return true;
    });
    await computerChatRuntime.send(id, 'do work', options);
    expect(computerWorkflowApi.start).not.toHaveBeenCalled();
  });

  it('keeps a failed verification result pending and stops planning', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(evaluateAction)
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ ...receipt, verdict: 'deny' });
    await computerChatRuntime.send(id, 'do work', options);
    expect(read(id).policy?.verdict).toBe('deny');
    expect(read(id).pending?.result).toEqual(result);
    expect(computerSessionApi.infer).toHaveBeenCalledTimes(1);
  });

  it('reevaluates a saved approval before dispatch and honors the current policy', async () => {
    const id = await chat();
    await store.getState().save({
      ...read(id),
      pending: {
        requestId: crypto.randomUUID(),
        computer,
        action: { name: 'execute', arguments: { command: ['pwd'] } },
        command: ['pwd'],
        durable: false,
        verify: true,
        admission: { ...receipt, phase: 'admission' },
      },
    });
    vi.mocked(evaluateAction).mockResolvedValueOnce({ ...receipt, verdict: 'deny' });
    await computerChatRuntime.resume(id);
    expect(evaluateAction).toHaveBeenCalledOnce();
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
    expect(read(id).error).toContain('Policy deny');
  });

  it.each(['computer', 'cancel'] as const)(
    'discards admission after %s changes',
    async (change) => {
      const id = await chat();
      vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
      vi.mocked(evaluateAction).mockImplementationOnce(async () => {
        if (change === 'cancel') computerChatRuntime.pause(id);
        else
          await store
            .getState()
            .save({ ...read(id), session: { ...session, currentSandboxId: 'other-computer' } });
        return receipt;
      });
      await computerChatRuntime.send(id, 'do work', { ...options, durable: false });
      expect(computerSessionApi.execute).not.toHaveBeenCalled();
      expect(computerWorkflowApi.start).not.toHaveBeenCalled();
      expect(change === 'cancel' ? read(id).pauseNotice : read(id).error).toContain(
        change === 'cancel' ? 'Conversation paused.' : 'computer or pending action changed'
      );
    }
  );

  it('keeps the draft and avoids inference when the policy key is missing', async () => {
    const id = await chat();
    await store.getState().save({ ...read(id), draft: 'Keep my task' });
    vi.mocked(requirePolicyKey).mockRejectedValueOnce(
      new Error('Save an NSR policy API key in Chat settings first.')
    );
    await computerChatRuntime.send(id, 'Keep my task', options);
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    expect(computerWorkflowApi.start).not.toHaveBeenCalled();
    expect(read(id)).toMatchObject({
      draft: 'Keep my task',
      messages: [],
      error: expect.stringContaining('NSR policy API key'),
    });
  });

  it('skips the credential preflight only when policy checks were explicitly disabled', async () => {
    const id = await chat();
    await computerChatRuntime.send(id, 'Do work', { ...options, verify: false });
    expect(requirePolicyKey).not.toHaveBeenCalled();
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
  });

  it.each(['workspace', 'pause'] as const)(
    'discards a credential preflight after %s changes',
    async (change) => {
      const id = await chat();
      vi.mocked(requirePolicyKey).mockImplementationOnce(async () => {
        if (change === 'pause') computerChatRuntime.pause(id);
        else useAuthStore.setState({ currentBrand: { id: 'other-brand' } as never });
        return 'policy-key';
      });
      await computerChatRuntime.send(id, 'Keep this task', options);
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
      expect(read(id).messages).toEqual([]);
    }
  );

  it('persists the exact computer identity before dispatching an action', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(computerSessionApi.execute).mockImplementationOnce(async () => {
      const snapshot = vi.mocked(window.electronAPI!.store.set).mock
        .lastCall?.[1] as ComputerChat[];
      expect(snapshot.find((item) => item.id === id)?.pending?.computer).toEqual(computer);
      return result;
    });
    await computerChatRuntime.send(id, 'Read my notes', { ...options, durable: false });
    expect(computerSessionApi.execute).toHaveBeenCalledOnce();
    expect(read(id).error).toBeUndefined();
    expect(read(id).pending).toBeUndefined();
  });

  it.each([true, false])(
    'never replays an uncertain action on a replacement computer (policy=%s)',
    async (verify) => {
      const id = await chat();
      vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
      vi.mocked(computerSessionApi.execute).mockRejectedValueOnce(
        new Error('Lost execution acknowledgement')
      );
      await computerChatRuntime.send(id, 'Read my notes', { ...options, durable: false, verify });
      const requestId = read(id).pending?.requestId;
      vi.mocked(computerSessionApi.get).mockResolvedValue({
        ...session,
        currentSandboxId: 'replacement',
      });
      await computerChatRuntime.resume(id);
      expect(computerSessionApi.execute).toHaveBeenCalledOnce();
      expect(read(id).pending).toMatchObject({ requestId, computer });
      expect(read(id).error).toContain('cannot run or be accepted on this computer');
    }
  );

  it.each([
    { currentSandboxId: 'replacement' },
    { id: 'foreign-session' },
    { organizationId: 'foreign-org' },
  ])(
    'retains execution evidence without verifying it against changed identity %j',
    async (patch) => {
      const id = await chat();
      vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
      vi.mocked(computerSessionApi.execute).mockImplementationOnce(async () => {
        vi.mocked(computerSessionApi.get).mockResolvedValue({ ...session, ...patch });
        return result;
      });
      await computerChatRuntime.send(id, 'Read my notes', { ...options, durable: false });
      expect(read(id).pending).toMatchObject({ computer, result });
      expect(evaluateAction).toHaveBeenCalledOnce();
      expect(read(id).messages.some((item) => item.role === 'tool')).toBe(false);
      await computerChatRuntime.resume(id);
      expect(computerSessionApi.execute).toHaveBeenCalledOnce();
    }
  );

  it('discards a late output approval after the computer changes', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce(toolResponse());
    vi.mocked(evaluateAction)
      .mockResolvedValueOnce(receipt)
      .mockImplementationOnce(async () => {
        await store
          .getState()
          .save({ ...read(id), session: { ...session, currentSandboxId: 'replacement' } });
        return receipt;
      });
    await computerChatRuntime.send(id, 'Read my notes', { ...options, durable: false });
    expect(read(id).pending).toMatchObject({ computer, result });
    expect(read(id).messages.some((item) => item.role === 'tool')).toBe(false);
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
  });

  it('retains older unbound actions for inspection without dispatch or inference', async () => {
    const id = await chat();
    const pending: PendingAction = {
      requestId: crypto.randomUUID(),
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      command: ['pwd'],
      durable: false,
      verify: false,
    };
    await store.getState().save({ ...read(id), pending });
    await computerChatRuntime.resume(id);
    expect(read(id).pending).toEqual(pending);
    expect(read(id).error).toContain('no recorded computer identity');
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
  });

  it.each([{ id: 'different-session' }, { organizationId: 'foreign-org' }])(
    'rejects a foreign status identity before inference %j',
    async (patch) => {
      const id = await chat();
      vi.mocked(computerSessionApi.get).mockResolvedValue({ ...session, ...patch });
      await computerChatRuntime.send(id, 'Read my notes', options);
      expect(read(id).session).toEqual(session);
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
    }
  );

  it('rejects foreign identities during a background refresh', async () => {
    const id = await chat();
    vi.mocked(computerSessionApi.get).mockResolvedValue({ ...session, id: 'foreign-session' });
    await computerChatRuntime.refresh(id);
    expect(read(id).session).toEqual(session);
    expect(read(id).error).toContain('different session identity');
  });

  it('keeps an unexpected startup acknowledgement unconfirmed until the original session is reconciled', async () => {
    const id = await computerChatRuntime.create('tenant-1', 'brand-1');
    vi.mocked(computerSessionApi.start).mockResolvedValueOnce({
      ...session,
      id: 'foreign-session',
    });
    await computerChatRuntime.provision(id);
    expect(read(id).session?.id).toBe(session.id);
    expect(read(id).sandboxStartUnconfirmed).toBe(true);
    await computerChatRuntime.provision(id);
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
    expect(read(id).session).toEqual(session);
    expect(read(id).sandboxStartUnconfirmed).toBe(false);
  });

  it('resumes an existing workflow without starting it again', async () => {
    const id = await chat();
    const pending: PendingAction = {
      requestId: crypto.randomUUID(),
      computer,
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      command: ['pwd'],
      durable: true,
      verify: true,
      engineUrl: 'https://workflows.example',
      workflowId: 'existing-workflow',
      runId: 'existing-run',
      admission: receipt,
    };
    await store.getState().save({ ...read(id), pending });
    await computerChatRuntime.resume(id);
    expect(computerWorkflowApi.start).not.toHaveBeenCalled();
    expect(computerWorkflowApi.status).toHaveBeenCalledWith('tenant-1', 'existing-workflow');
  });

  it.each(['pending', 'stopped', 'missing_session'] as const)(
    'never provisions a computer while recovering %s',
    async (state) => {
      const id = await chat();
      const pending: PendingAction = {
        requestId: crypto.randomUUID(),
        computer,
        action: { name: 'execute', arguments: { command: ['pwd'] } },
        command: ['pwd'],
        verify: true,
        durable: false,
      };
      await store.getState().save({
        ...read(id),
        pending,
        ...(state === 'missing_session' ? { session: undefined } : {}),
      });
      vi.mocked(computerSessionApi.create).mockClear();
      vi.mocked(computerSessionApi.start).mockClear();
      vi.mocked(computerSessionApi.get).mockResolvedValue({
        ...session,
        status: state,
        currentSandboxId: null,
      });
      await computerChatRuntime.resume(id);
      expect(computerSessionApi.create).not.toHaveBeenCalled();
      expect(computerSessionApi.start).not.toHaveBeenCalled();
      expect(computerSessionApi.execute).not.toHaveBeenCalled();
      expect(evaluateAction).not.toHaveBeenCalled();
      expect(read(id).pending).toEqual(pending);
    }
  );
});
