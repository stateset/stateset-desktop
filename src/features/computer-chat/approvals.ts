import { chatEnded } from './library';
import type { ComputerChat } from './types';

export const APPROVAL_DURATION_MS = 10 * 60 * 1000;

// Pin all displayed action/policy data, not just the server's request ID and hash.
// A replacement or a new review window always requires fresh consent.
export function approvalVersion(chat: ComputerChat): string {
  return JSON.stringify([
    chat.id,
    chat.tenantId,
    chat.brandId,
    chat.durableSession?.workflowId,
    chat.durableSession?.engineUrl,
    chat.serverState?.generation,
    chat.serverState?.pending_action,
  ]);
}

export function approvalUnavailable(chat: ComputerChat, now = Date.now()): string | undefined {
  const state = chat.serverState;
  const action = state?.pending_action;
  if (chatEnded(chat) || state?.stop_requested) return 'This computer has ended or is stopping.';
  if (state?.status !== 'awaiting_approval' || !action || action.result_available)
    return 'This action is no longer waiting for review.';
  if (!action.request_id || !action.admission?.evaluation.canonical_action_hash)
    return 'Policy details are incomplete. Refresh the conversation.';
  if (action.admission.final_verdict === 'deny') return 'Policy denied this action.';
  const started = action.review_started_ms;
  if (!Number.isSafeInteger(started) || started <= 0 || started > now)
    return 'The approval time cannot be confirmed. Check your clock and refresh.';
  if (now >= started + APPROVAL_DURATION_MS)
    return 'This approval has expired. Refresh to see the latest workflow status.';
}

export function supportedReplacement(chat: ComputerChat): boolean {
  const action = chat.serverState?.pending_action;
  const replacement = action?.admission?.evaluation.rewritten_action;
  return Boolean(
    action?.name === 'execute' &&
    !action.rewritten &&
    replacement &&
    typeof replacement === 'object' &&
    'type' in replacement &&
    replacement.type === 'execute_command' &&
    'command' in replacement &&
    Array.isArray(replacement.command) &&
    replacement.command.length > 0 &&
    replacement.command.length <= 64 &&
    replacement.command.every(
      (part) => typeof part === 'string' && part.length > 0 && !part.includes('\0')
    ) &&
    replacement.command[0].trim()
  );
}
