import { describe, expect, it } from 'vitest';
import { conversationStatus, lastSyncDescription } from './presentation';
import { selectChats } from './library';
import type { ComputerChat, ComputerChatActivity } from './types';
function chat(status = 'idle', patch: Partial<ComputerChat> = {}): ComputerChat {
  return {
    id: 'chat',
    title: 'Report',
    tenantId: 'tenant',
    brandId: 'brand',
    createdAt: '',
    updatedAt: '',
    messages: [],
    workflows: [],
    durableSession: {},
    serverState: { status },
    ...patch,
  } as unknown as ComputerChat;
}
describe('conversation status presentation', () => {
  it.each<[ComputerChatActivity['kind'], string]>([
    ['setup', 'Preparing computer…'],
    ['status', 'Checking computer…'],
    ['agent', 'Working'],
    ['recovery', 'Recovering action…'],
    ['screenshot', 'Capturing desktop…'],
    ['file-check', 'Checking file…'],
    ['shutdown', 'Stopping computer…'],
  ])('shows live %s before stale saved state and restores that state afterward', (kind, label) => {
    const value = chat('idle', {
      durableSession: undefined,
      sandboxApiSession: { version: 1 },
      pauseNotice: 'Previously paused',
      error: 'Previous request failed',
    });
    expect(conversationStatus(value, undefined, { kind, pausing: false }).label).toBe(label);
    expect(conversationStatus(value, undefined, { kind, pausing: true }).label).toBe(
      kind === 'shutdown' ? 'Stopping computer…' : 'Pausing…'
    );
    expect(conversationStatus(value).label).toBe('Needs attention');
    value.error = undefined;
    expect(conversationStatus(value).label).toBe('Paused');
  });
  it('keeps ended and shutdown intent authoritative and ignores local activity for durable chats', () => {
    const activity: ComputerChatActivity = { kind: 'agent', pausing: false };
    const value = chat('idle', {
      durableSession: undefined,
      sandboxApiSession: { version: 1 },
      sandboxStopRequested: true,
      error: 'Shutdown could not be confirmed',
    });
    expect(conversationStatus(value, undefined, activity)).toEqual({
      label: 'Cleanup needs attention',
      tone: 'attention',
    });
    value.stopped = true;
    expect(conversationStatus(value, undefined, activity).label).toBe('Computer ended');
    expect(conversationStatus(chat('paused'), undefined, activity).label).toBe('Paused');
  });
  it('shows interrupted agent work after reopening while prioritizing live work, pauses and errors', () => {
    const value = chat('idle', {
      durableSession: undefined,
      serverState: undefined,
      sandboxApiSession: { version: 1 },
      session: { id: 's', organizationId: 'org', currentSandboxId: 'computer', status: 'running' },
      agentTurnUnfinished: true,
    });
    expect(conversationStatus(value)).toEqual({ label: 'Work interrupted', tone: 'attention' });
    expect(selectChats([value], 'tenant', 'brand', '', 'attention')).toEqual([value]);
    expect(conversationStatus(value, undefined, { kind: 'agent', pausing: false }).label).toBe(
      'Working'
    );
    expect(
      selectChats(
        [value],
        'tenant',
        'brand',
        '',
        'attention',
        {},
        { [value.id]: { kind: 'agent', pausing: false } }
      )
    ).toEqual([]);
    value.pauseNotice = 'Work paused';
    expect(conversationStatus(value).label).toBe('Paused');
    value.error = 'Connection failed';
    expect(conversationStatus(value).label).toBe('Needs attention');
    value.error = undefined;
    value.stopped = true;
    expect(conversationStatus(value).label).toBe('Computer ended');
    expect(selectChats([value], 'tenant', 'brand', '', 'attention')).toEqual([]);
  });
  it('keeps a saved pause distinct from errors while prioritizing action review and shutdown', () => {
    const value = chat('idle', {
      durableSession: undefined,
      serverState: undefined,
      sandboxApiSession: { version: 1 },
      session: { id: 's', organizationId: 'org', currentSandboxId: 'computer', status: 'running' },
      pauseNotice: 'Work paused. Your chat and computer are still available.',
    });
    expect(conversationStatus(value)).toEqual({ label: 'Paused', tone: 'paused' });
    value.error = 'Connection unavailable';
    expect(conversationStatus(value).label).toBe('Needs attention');
    value.error = undefined;
    value.pending = {
      requestId: 'pending',
      computer: { sessionId: 's', sandboxId: 'computer', organizationId: 'org' },
      command: ['pwd'],
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      durable: false,
      verify: true,
      result: { exitCode: 0, stdout: '', stderr: '', outputTruncated: false },
    };
    expect(conversationStatus(value).label).toBe('Result awaiting review');
    value.sandboxStopRequested = true;
    expect(conversationStatus(value).label).toBe('Stopping computer');
    value.stopped = true;
    expect(conversationStatus(value).label).toBe('Computer ended');
  });
  it('keeps a pending result in the attention filter with the same recovery status as the conversation', () => {
    const value = chat('idle', {
      durableSession: undefined,
      sandboxApiSession: { version: 1 },
      session: { id: 's', organizationId: 'org', currentSandboxId: 'computer', status: 'running' },
      pending: {
        requestId: 'request',
        computer: { sessionId: 's', sandboxId: 'computer', organizationId: 'org' },
        command: ['pwd'],
        action: { name: 'execute', arguments: { command: ['pwd'] } },
        durable: false,
        verify: true,
        result: { exitCode: 0, stdout: '', stderr: '', outputTruncated: false },
      },
    });
    expect(conversationStatus(value)).toEqual({
      label: 'Result awaiting review',
      tone: 'attention',
    });
    expect(selectChats([value], 'tenant', 'brand', '', 'attention')).toEqual([value]);
    value.session!.currentSandboxId = 'replacement';
    expect(conversationStatus(value).label).toBe('Computer changed');
    expect(selectChats([value], 'tenant', 'brand', '', 'attention')).toEqual([value]);
  });
  it.each([
    ['idle', 'Ready', 'active'],
    ['thinking', 'Working', 'active'],
    ['provisioning', 'Preparing computer', 'active'],
    ['awaiting_approval', 'Approval needed', 'attention'],
    ['needs_attention', 'Needs attention', 'attention'],
    ['acceptance_failed', 'Acceptance check failed', 'attention'],
    ['budget_exhausted', 'Budget reached', 'attention'],
    ['cleanup_pending', 'Cleanup needs attention', 'attention'],
    ['failed', 'Computer failed', 'attention'],
    ['paused', 'Paused', 'paused'],
    ['completed', 'Completed', 'quiet'],
    ['stopped', 'Computer ended', 'quiet'],
  ])('describes %s consistently', (status, label, tone) =>
    expect(conversationStatus(chat(status))).toEqual({ label, tone })
  );
  it('prioritizes connection issues and unconfirmed messages over ready state', () => {
    expect(conversationStatus(chat(), { status: 'attention' }).label).toBe(
      'Connection needs attention'
    );
    expect(conversationStatus(chat(), { status: 'reconnecting' }).label).toBe('Reconnecting');
    expect(
      conversationStatus(chat('idle', { pendingMessage: { id: 'm', content: 'Report' } })).label
    ).toBe('Message unconfirmed');
    expect(conversationStatus(chat('idle', { error: 'Signal was not confirmed' })).tone).toBe(
      'attention'
    );
  });
  it('shows failed acceptance even when the computer is idle', () => {
    const value = chat();
    value.serverState!.verification = { outcome: 'failed' } as never;
    expect(conversationStatus(value).label).toBe('Acceptance check failed');
  });
  it('distinguishes shutdown, pauses and legacy observations', () => {
    const stopping = chat();
    stopping.serverState!.stop_requested = true;
    expect(conversationStatus(stopping).label).toBe('Stopping computer');
    const paused = chat();
    paused.serverState!.paused = true;
    expect(conversationStatus(paused).label).toBe('Paused');
    expect(conversationStatus(chat('idle', { durableSession: undefined })).label).toBe(
      'Previous local session'
    );
    expect(
      conversationStatus(chat('idle', { durableSession: undefined, stopped: true })).label
    ).toBe('Computer ended');
  });
  it.each([
    'awaiting_approval',
    'needs_attention',
    'acceptance_failed',
    'budget_exhausted',
    'cleanup_pending',
    'failed',
  ])('includes %s in attention filtering without relying on an error string', (status) => {
    expect(selectChats([chat(status)], 'tenant', 'brand', '', 'attention')).toHaveLength(1);
  });
});
describe('saved observation age', () => {
  const now = 200000000;
  it.each([
    [undefined, 'No successful sync yet'],
    [NaN, 'No successful sync yet'],
    [now + 1000, 'Last synced less than a minute ago'],
    [now - 60000, 'Last synced 1 minute ago'],
    [now - 125000, 'Last synced 2 minutes ago'],
    [now - 3600000, 'Last synced 1 hour ago'],
    [now - 172800000, 'Last synced 2 days ago'],
  ] as const)('formats %s safely', (at, text) => expect(lastSyncDescription(at, now)).toBe(text));
});
