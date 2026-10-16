import type { ChatMessage } from '../../types';
import type { DurableChatStatus } from './durableTypes';

/** The engine limits imported messages in UTF-8 bytes, including the role prefix. */
export function importChatMessages(messages: { role: string; content: string }[]) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-30)
    .map((message) => {
      const bytes = new Uint8Array(8000);
      // encodeInto stops before an incomplete code point rather than splitting it.
      const { written } = encoder.encodeInto(`Previous ${message.role}: ${message.content}`, bytes);
      return {
        id: crypto.randomUUID(),
        content: decoder.decode(bytes.subarray(0, written)),
      };
    });
}

// Retain observations already received when a workflow returns a shorter window.
// Bound both record count and encoded size, including multibyte text and details.
function mergeRecords<T extends { id: string | number }>(
  previous: T[],
  incoming: T[],
  count: number,
  bytes: number,
  compare: (a: T, b: T) => number
) {
  const records = new Map(previous.map((record) => [record.id, record]));
  for (const record of incoming) {
    const existing = records.get(record.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(record))
      records.set(record.id, record);
  }
  const ordered = [...records.values()].sort(compare);
  const encoder = new TextEncoder();
  let size = 2; // JSON array brackets
  let first = ordered.length;
  for (let index = ordered.length - 1; index >= 0 && ordered.length - index <= count; index--) {
    const length =
      encoder.encode(JSON.stringify(ordered[index])).length + (first < ordered.length ? 1 : 0);
    if (size + length > bytes) break;
    size += length;
    first = index;
  }
  return { records: ordered.slice(first), truncated: first > 0 };
}
export function mergeChatHistory(previous: ChatMessage[], incoming: ChatMessage[]) {
  const merged = mergeRecords(
    previous,
    incoming,
    1000,
    512_000,
    (a, b) => a.timestamp - b.timestamp
  );
  return {
    messages: merged.records,
    truncated: merged.truncated,
  };
}
export function mergeTimeline(
  previous: DurableChatStatus['events'],
  incoming: DurableChatStatus['events']
) {
  const merged = mergeRecords(
    [...previous].sort((a, b) => a.id - b.id),
    incoming,
    1000,
    384_000,
    (a, b) => a.id - b.id
  );
  return { events: merged.records.sort((a, b) => a.id - b.id), truncated: merged.truncated };
}
