import type { ChatConnection, ComputerChat, ComputerChatActivity } from './types';
import { terminalChat } from './durableTypes';

export type ChatFilter = 'all' | 'active' | 'attention' | 'ended' | 'archived';

export function lastOpenedChat(chats: ComputerChat[], tenantId?: string, brandId?: string) {
  if (!tenantId || !brandId) return undefined;
  return chats
    .filter(
      (chat) =>
        chat.tenantId === tenantId &&
        chat.brandId === brandId &&
        (Date.parse(chat.lastOpenedAt ?? '') || 0) > 0
    )
    .sort(
      (a, b) =>
        Date.parse(b.lastOpenedAt!) - Date.parse(a.lastOpenedAt!) || a.id.localeCompare(b.id)
    )[0];
}
export function chatEnded(chat: ComputerChat) {
  return Boolean(
    chat.stopped ||
    chat.serverState?.cleanup_verified ||
    terminalChat(chat.serverState?.status ?? '')
  );
}
export function chatNeedsAttention(chat: ComputerChat, activity?: ComputerChatActivity) {
  return Boolean(
    chat.error ||
    (chat.sandboxApiSession &&
      !chatEnded(chat) &&
      !chat.sandboxStopRequested &&
      !activity &&
      chat.agentTurnUnfinished) ||
    chat.pending ||
    chat.pendingMessage ||
    chat.serverState?.error ||
    [
      'awaiting_approval',
      'needs_attention',
      'acceptance_failed',
      'budget_exhausted',
      'cleanup_pending',
      'failed',
    ].includes(chat.serverState?.status ?? '') ||
    chat.serverState?.verification?.outcome === 'failed'
  );
}
export function selectChats(
  chats: ComputerChat[],
  tenantId: string | undefined,
  brandId: string | undefined,
  query = '',
  filter: ChatFilter = 'all',
  connections: Record<string, ChatConnection> = {},
  activities: Record<string, ComputerChatActivity> = {}
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return chats
    .filter((chat) => {
      if (!tenantId || !brandId || chat.tenantId !== tenantId || chat.brandId !== brandId)
        return false;
      if (filter === 'archived' ? !chat.archived : chat.archived) return false;
      if (filter === 'active' && chatEnded(chat)) return false;
      if (filter === 'ended' && !chatEnded(chat)) return false;
      if (
        filter === 'attention' &&
        !chatNeedsAttention(chat, activities[chat.id]) &&
        connections[chat.id]?.status !== 'attention'
      )
        return false;
      if (!terms.length) return true;
      const text = [
        chat.title,
        chat.durableSession?.workflowId,
        chat.session?.id,
        ...chat.messages.filter((m) => m.role !== 'tool').map((m) => m.content),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
        a.id.localeCompare(b.id)
    );
}
