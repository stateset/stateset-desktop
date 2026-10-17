import { describe, expect, it } from 'vitest';
import { lastOpenedChat, selectChats } from './library';
import type { ComputerChat } from './types';
function chat(id: string, patch: Partial<ComputerChat> = {}): ComputerChat {
  return {
    id,
    title: id,
    tenantId: 'tenant',
    brandId: 'brand',
    createdAt: '',
    updatedAt: '2026-10-14T00:00:00Z',
    messages: [],
    workflows: [],
    ...patch,
  };
}
describe('conversation library selection', () => {
  it('restores only explicitly opened conversations in the active scope', () => {
    const chats = [
      chat('unopened'),
      chat('old', { lastOpenedAt: '2026-10-13T00:00:00Z' }),
      chat('latest', { lastOpenedAt: '2026-10-14T00:00:00Z', archived: true }),
      chat('foreign', { tenantId: 'other', lastOpenedAt: '2026-10-15T00:00:00Z' }),
      chat('malformed', { lastOpenedAt: 'invalid' }),
    ];
    expect(lastOpenedChat(chats, 'tenant', 'brand')?.id).toBe('latest');
    expect(lastOpenedChat(chats, undefined, 'brand')).toBeUndefined();
    expect(lastOpenedChat([chat('unopened')], 'tenant', 'brand')).toBeUndefined();
  });
  it('keeps organization and brand boundaries even for matching search terms', () => {
    const chats = [
      chat('own'),
      chat('foreign', { tenantId: 'other' }),
      chat('brand', { brandId: 'other' }),
    ];
    expect(selectChats(chats, 'tenant', 'brand').map((c) => c.id)).toEqual(['own']);
    expect(selectChats(chats, undefined, 'brand')).toEqual([]);
  });
  it('searches both names and transcript text using every word', () => {
    const chats = [
      chat('Quarterly report', {
        messages: [{ id: 'm', role: 'user', content: 'Reconcile October invoices', timestamp: 1 }],
      }),
      chat('Another report'),
    ];
    expect(selectChats(chats, 'tenant', 'brand', 'REPORT october').map((c) => c.id)).toEqual([
      'Quarterly report',
    ]);
  });
  it('sorts pins first and then by activity without relying on polling insertion order', () => {
    expect(
      selectChats(
        [
          chat('old-pin', { pinned: true }),
          chat('new', { updatedAt: '2026-10-15T00:00:00Z' }),
          chat('old'),
        ],
        'tenant',
        'brand'
      ).map((c) => c.id)
    ).toEqual(['old-pin', 'new', 'old']);
  });
  it('separates archived chats and identifies pending messages needing attention', () => {
    const chats = [
      chat('archived', { archived: true }),
      chat('pending', { pendingMessage: { id: 'm', content: 'Request' } }),
      chat('ended', { stopped: true }),
    ];
    expect(selectChats(chats, 'tenant', 'brand', '', 'archived').map((c) => c.id)).toEqual([
      'archived',
    ]);
    expect(selectChats(chats, 'tenant', 'brand', '', 'attention').map((c) => c.id)).toEqual([
      'pending',
    ]);
    expect(selectChats(chats, 'tenant', 'brand', '', 'ended').map((c) => c.id)).toEqual(['ended']);
  });
  it('includes rejected connections in the attention view', () => {
    expect(
      selectChats([chat('locked')], 'tenant', 'brand', '', 'attention', {
        locked: { status: 'attention', failures: 1, message: 'Invalid key' },
      }).map((c) => c.id)
    ).toEqual(['locked']);
  });
});
