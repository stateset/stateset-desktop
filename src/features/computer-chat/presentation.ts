import { chatEnded, chatNeedsAttention } from './library';
import type { ChatConnection, ComputerChat } from './types';

export interface ConversationStatus {
  label: string;
  tone: 'quiet' | 'active' | 'paused' | 'attention';
}

/** One description of the saved computer state wherever a conversation is shown. */
export function conversationStatus(
  chat: ComputerChat,
  connection?: Pick<ChatConnection, 'status'>
): ConversationStatus {
  const state = chat.serverState;
  if (!chat.durableSession)
    return { label: chatEnded(chat) ? 'Computer ended' : 'Previous local session', tone: 'quiet' };
  if (state?.status === 'cleanup_pending')
    return { label: 'Cleanup needs attention', tone: 'attention' };
  if (state?.status === 'budget_exhausted') return { label: 'Budget reached', tone: 'attention' };
  if (state?.status === 'failed') return { label: 'Computer failed', tone: 'attention' };
  if (connection?.status === 'attention')
    return { label: 'Connection needs attention', tone: 'attention' };
  if (connection?.status === 'reconnecting') return { label: 'Reconnecting', tone: 'quiet' };
  if (state?.stop_requested && !state.cleanup_verified)
    return { label: 'Stopping computer', tone: 'quiet' };
  if (state?.status === 'awaiting_approval') return { label: 'Approval needed', tone: 'attention' };
  if (chat.error || state?.error || state?.status === 'needs_attention')
    return { label: 'Needs attention', tone: 'attention' };
  if (chat.pendingMessage) return { label: 'Message unconfirmed', tone: 'attention' };
  if (state?.verification?.outcome === 'failed' || state?.status === 'acceptance_failed')
    return { label: 'Acceptance check failed', tone: 'attention' };
  if (chatEnded(chat))
    return { label: state?.status === 'completed' ? 'Completed' : 'Computer ended', tone: 'quiet' };
  if (state?.paused || state?.status === 'paused') return { label: 'Paused', tone: 'paused' };
  const labels: Record<string, string> = {
    idle: 'Ready',
    thinking: 'Working',
    provisioning: 'Preparing computer',
  };
  const label = state
    ? (labels[state.status] ??
      state.status.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase()))
    : 'Connecting';
  return {
    label,
    tone: chatNeedsAttention(chat)
      ? 'attention'
      : state && ['idle', 'thinking', 'provisioning'].includes(state.status)
        ? 'active'
        : 'quiet',
  };
}

export function lastSyncDescription(at: number | undefined, now = Date.now()) {
  if (at === undefined || !Number.isFinite(at) || at < 0) return 'No successful sync yet';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return 'Last synced less than a minute ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last synced ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `Last synced ${days} ${days === 1 ? 'day' : 'days'} ago`;
}
