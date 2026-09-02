import type { StreamEvent } from '../../hooks/useAgentStream';
import type { MessageEvent } from '../../types';
import type { AssistantFocus } from '../../lib/voice/index';
import { CONVERSATION_MESSAGE_LIMIT, QUICK_ACTION_PROMPTS } from './constants';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};

export type MessageStreamEvent = StreamEvent & MessageEvent;

export function isMessageEvent(event: StreamEvent): event is MessageStreamEvent {
  return event.type === 'message';
}

/**
 * Maps raw stream events to deduplicated conversation messages, keeping only
 * the most recent CONVERSATION_MESSAGE_LIMIT entries.
 */
export function mapStreamMessagesToConversation(
  messages: readonly StreamEvent[]
): ConversationMessage[] {
  const seen = new Set<string>();
  const mapped: ConversationMessage[] = [];
  for (const event of messages) {
    if (!isMessageEvent(event)) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    mapped.push({
      id: event.id,
      role: event.role,
      content: event.content,
      timestamp: event._timestamp,
    });
  }
  return mapped.slice(-CONVERSATION_MESSAGE_LIMIT);
}

export interface StreamStatusFlags {
  isTranscribing: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  isConnecting: boolean;
  isProvisioningSession: boolean;
  isConnected: boolean;
  hasSession: boolean;
}

/** Derives the single status label shown in the voice header. */
export function getStreamStatusLabel(flags: StreamStatusFlags): string {
  if (flags.isTranscribing) return 'Transcribing voice';
  if (flags.isRecording) return 'Listening';
  if (flags.isSpeaking) return 'Speaking';
  if (flags.isConnecting || flags.isProvisioningSession) return 'Connecting';
  if (flags.isConnected) return 'Live';
  if (flags.hasSession) return 'Ready';
  return 'Offline';
}

/** Returns the quick-start prompts for the selected assistant focus. */
export function getQuickActionPrompts(focus: AssistantFocus): readonly string[] {
  return QUICK_ACTION_PROMPTS[focus];
}
