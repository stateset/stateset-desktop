import type { ChatMessage } from '../../types';

const MAX_PREVIEW_LENGTH = 500;

/** Condenses a tool result into a short string safe to keep in conversation history. */
export function toToolPreview(result: unknown): string | undefined {
  if (result === undefined) return undefined;

  let text: string;
  if (typeof result === 'string') {
    text = result;
  } else {
    try {
      text = JSON.stringify(result) ?? String(result);
    } catch {
      return '[unserializable result]';
    }
  }

  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text;
}

/**
 * Strips a tool call's payload before a conversation is written to disk. Tool
 * arguments and results can carry API tokens or customer data, and the saved
 * transcript only needs what the tool was and how it went.
 */
export function stripToolPayloads(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'tool' || !message.tool) return message;
    const { name, status, durationMs } = message.tool;
    return { ...message, tool: { name, status, durationMs } };
  });
}
