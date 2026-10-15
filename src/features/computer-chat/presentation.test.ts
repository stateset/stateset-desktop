import { describe, expect, it } from 'vitest';
import { conversationStatus, lastSyncDescription } from './presentation';
import { selectChats } from './library';
import type { ComputerChat } from './types';
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
