/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputerChatsStore } from './store';
import { computerChatRuntime } from './runtime';
import { computerSessionApi, computerWorkflowApi, evaluateAction } from './api';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import type { ComputerChat, PendingAction, PolicyReceipt } from './types';

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
    },
    computerWorkflowApi: { start: vi.fn(), status: vi.fn(), cancel: vi.fn() },
    evaluateAction: vi.fn(),
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
const receipt: PolicyReceipt = {
  phase: 'verification',
  verdict: 'allow',
  actionHash: 'hash',
  evidenceIds: ['evidence'],
  reasons: [],
  checkedAt: '2026-10-14',
};
const store = useComputerChatsStore;
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
  store.setState({ chats: [], busy: {}, loaded: true });
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
  vi.mocked(computerSessionApi.infer).mockResolvedValue({
    content: [{ type: 'text', text: 'Done.' }],
  });
  vi.mocked(computerWorkflowApi.start).mockResolvedValue({
    workflow_id: 'workflow-1',
    run_id: 'run-1',
  });
  vi.mocked(computerWorkflowApi.status).mockResolvedValue({ status: 'completed', result });
  vi.mocked(evaluateAction).mockResolvedValue(receipt);
});

describe('computer chat lifecycle', () => {
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
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(new Error('start unavailable'));
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
      expect.objectContaining({ name: 'execute' })
    );
    expect(evaluateAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id }),
      expect.objectContaining({ name: 'execute' }),
      result
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

  it('resumes an existing workflow without starting it again', async () => {
    const id = await chat();
    const pending: PendingAction = {
      requestId: crypto.randomUUID(),
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
});
