import { describe, expect, it } from 'vitest';
import { importChatMessages, mergeChatHistory, mergeTimeline } from './history';
const message = (id: string, timestamp: number, content = id) => ({
  id,
  role: 'assistant' as const,
  content,
  timestamp,
});

describe('history imported into a new engine workflow', () => {
  it.each(['a', 'é', '漢', '🙂'])(
    'fits %s text without splitting a UTF-8 character',
    (character) => {
      const prefix = 'Previous user: ';
      const content = character.repeat(8000);
      const count = Math.floor(
        (8000 - new TextEncoder().encode(prefix).length) /
          new TextEncoder().encode(character).length
      );
      const [imported] = importChatMessages([{ role: 'user', content }]);
      expect(imported.content).toBe(prefix + character.repeat(count));
      expect(new TextEncoder().encode(imported.content).length).toBeLessThanOrEqual(8000);
      expect(imported.content).not.toContain('\uFFFD');
    }
  );
  it('keeps the latest thirty user and assistant messages without changing the original history', () => {
    const messages = Array.from({ length: 32 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Original ${index}`,
    }));
    const original = structuredClone(messages);
    const imported = importChatMessages([
      ...messages,
      { role: 'tool', content: 'Tool output' },
      { role: 'system', content: 'System instruction' },
    ]);
    expect(imported).toHaveLength(30);
    expect(imported[0].content).toBe('Previous user: Original 2');
    expect(imported[29].content).toBe('Previous assistant: Original 31');
    expect(new Set(imported.map((entry) => entry.id)).size).toBe(30);
    expect(messages).toEqual(original);
  });
});
describe('retained conversation history', () => {
  it('retains earlier messages when the server returns a compacted window and updates duplicate IDs', () => {
    const merged = mergeChatHistory(
      [message('one', 1), message('two', 2)],
      [message('two', 2, 'updated'), message('three', 3)]
    );
    expect(merged.messages.map((m) => m.content)).toEqual(['one', 'updated', 'three']);
    expect(merged.truncated).toBe(false);
  });
  it('bounds persisted UTF-8 bytes as well as message count', () => {
    const merged = mergeChatHistory(
      [],
      Array.from({ length: 200 }, (_, index) => message(String(index), index, '🌎'.repeat(2000)))
    );
    expect(new TextEncoder().encode(JSON.stringify(merged.messages)).length).toBeLessThanOrEqual(
      512_000
    );
    expect(merged.messages[merged.messages.length - 1].id).toBe('199');
    expect(merged.truncated).toBe(true);
  });
  it('keeps at most a thousand small messages', () => {
    const merged = mergeChatHistory(
      [],
      Array.from({ length: 1100 }, (_, index) => message(String(index), index))
    );
    expect(merged.messages).toHaveLength(1000);
    expect(merged.messages[0].id).toBe('100');
  });
  it('merges timeline windows by stable event identity and preserves ordering', () => {
    const event = (id: number, detail: string) => ({
      id,
      kind: 'action_completed',
      at: id,
      detail,
    });
    expect(
      mergeTimeline([event(1, 'first'), event(2, 'old')], [event(2, 'updated'), event(3, 'last')])
        .events
    ).toEqual([event(1, 'first'), event(2, 'updated'), event(3, 'last')]);
  });
  it('does not evict recent history when an older missing message arrives out of order', () => {
    const original = Array.from({ length: 1000 }, (_, i) => message(String(i), i));
    const merged = mergeChatHistory(original, [message('older', -1)]);
    expect(merged.messages).toHaveLength(1000);
    expect(merged.messages[0].id).toBe('0');
    expect(merged.messages[999].id).toBe('999');
  });
});
