import { describe, it, expect } from 'vitest';
import type { StreamEvent } from '../../hooks/useAgentStream';
import {
  getQuickActionPrompts,
  getStreamStatusLabel,
  isMessageEvent,
  mapStreamMessagesToConversation,
  type StreamStatusFlags,
} from './utils';
import { CONVERSATION_MESSAGE_LIMIT, QUICK_ACTION_PROMPTS } from './constants';

function makeMessageEvent(
  id: string,
  overrides: Partial<StreamEvent & { role: 'user' | 'assistant' | 'system' }> = {}
): StreamEvent {
  return {
    type: 'message',
    id,
    role: 'assistant',
    content: `content-${id}`,
    _id: `stream-${id}`,
    _timestamp: 1000,
    ...overrides,
  } as StreamEvent;
}

describe('isMessageEvent', () => {
  it('returns true for message events', () => {
    expect(isMessageEvent(makeMessageEvent('m1'))).toBe(true);
  });

  it('returns false for non-message events', () => {
    const event = {
      type: 'log',
      level: 'info',
      message: 'hello',
      _id: 'log-1',
      _timestamp: 1000,
    } as StreamEvent;
    expect(isMessageEvent(event)).toBe(false);
  });
});

describe('mapStreamMessagesToConversation', () => {
  it('maps message events to conversation messages', () => {
    const events = [makeMessageEvent('m1', { role: 'user', _timestamp: 42 })];

    expect(mapStreamMessagesToConversation(events)).toEqual([
      { id: 'm1', role: 'user', content: 'content-m1', timestamp: 42 },
    ]);
  });

  it('filters out non-message events', () => {
    const events: StreamEvent[] = [
      { type: 'thinking', content: 'hmm', _id: 't1', _timestamp: 1 } as StreamEvent,
      makeMessageEvent('m1'),
      { type: 'heartbeat', timestamp: 'now', _id: 'h1', _timestamp: 2 } as StreamEvent,
    ];

    const result = mapStreamMessagesToConversation(events);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  it('deduplicates events with the same id, keeping the first', () => {
    const events = [
      makeMessageEvent('m1', { content: 'first' }),
      makeMessageEvent('m1', { content: 'second' }),
    ];

    const result = mapStreamMessagesToConversation(events);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('first');
  });

  it('keeps only the most recent messages up to the limit', () => {
    const events = Array.from({ length: CONVERSATION_MESSAGE_LIMIT + 10 }, (_, i) =>
      makeMessageEvent(`m${i}`)
    );

    const result = mapStreamMessagesToConversation(events);
    expect(result).toHaveLength(CONVERSATION_MESSAGE_LIMIT);
    expect(result[0].id).toBe('m10');
    expect(result[result.length - 1].id).toBe(`m${CONVERSATION_MESSAGE_LIMIT + 9}`);
  });

  it('returns an empty array for no events', () => {
    expect(mapStreamMessagesToConversation([])).toEqual([]);
  });
});

describe('getStreamStatusLabel', () => {
  const base: StreamStatusFlags = {
    isTranscribing: false,
    isRecording: false,
    isSpeaking: false,
    isConnecting: false,
    isProvisioningSession: false,
    isConnected: false,
    hasSession: false,
  };

  it('returns Offline when idle with no session', () => {
    expect(getStreamStatusLabel(base)).toBe('Offline');
  });

  it('returns Ready when a session exists but is not connected', () => {
    expect(getStreamStatusLabel({ ...base, hasSession: true })).toBe('Ready');
  });

  it('returns Live when connected', () => {
    expect(getStreamStatusLabel({ ...base, isConnected: true, hasSession: true })).toBe('Live');
  });

  it('returns Connecting while connecting or provisioning', () => {
    expect(getStreamStatusLabel({ ...base, isConnecting: true })).toBe('Connecting');
    expect(getStreamStatusLabel({ ...base, isProvisioningSession: true })).toBe('Connecting');
  });

  it('prioritizes transcribing over all other states', () => {
    expect(
      getStreamStatusLabel({
        ...base,
        isTranscribing: true,
        isRecording: true,
        isSpeaking: true,
        isConnected: true,
      })
    ).toBe('Transcribing voice');
  });

  it('prioritizes recording over speaking and connection states', () => {
    expect(
      getStreamStatusLabel({ ...base, isRecording: true, isSpeaking: true, isConnected: true })
    ).toBe('Listening');
  });

  it('prioritizes speaking over connection states', () => {
    expect(getStreamStatusLabel({ ...base, isSpeaking: true, isConnected: true })).toBe('Speaking');
  });
});

describe('getQuickActionPrompts', () => {
  it('returns three prompts for each focus', () => {
    expect(getQuickActionPrompts('support')).toHaveLength(3);
    expect(getQuickActionPrompts('operations')).toHaveLength(3);
    expect(getQuickActionPrompts('growth')).toHaveLength(3);
  });

  it('returns the focus-specific prompt set', () => {
    expect(getQuickActionPrompts('operations')).toBe(QUICK_ACTION_PROMPTS.operations);
    expect(getQuickActionPrompts('growth')).toBe(QUICK_ACTION_PROMPTS.growth);
    expect(getQuickActionPrompts('support')).toBe(QUICK_ACTION_PROMPTS.support);
  });
});
