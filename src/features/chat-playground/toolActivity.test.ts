import { describe, it, expect } from 'vitest';
import { toToolPreview, stripToolPayloads } from './toolActivity';
import type { ChatMessage } from '../../types';

describe('toToolPreview', () => {
  it('passes a short string through unchanged', () => {
    expect(toToolPreview('ok')).toBe('ok');
  });

  it('stringifies objects and arrays', () => {
    expect(toToolPreview({ orders: [1, 2] })).toBe('{"orders":[1,2]}');
    expect(toToolPreview([1, 2])).toBe('[1,2]');
  });

  it('renders primitives readably', () => {
    expect(toToolPreview(42)).toBe('42');
    expect(toToolPreview(true)).toBe('true');
    expect(toToolPreview(null)).toBe('null');
  });

  it('returns undefined when there is no result', () => {
    expect(toToolPreview(undefined)).toBeUndefined();
  });

  it('truncates long output', () => {
    const preview = toToolPreview('x'.repeat(900));

    expect(preview).toHaveLength(500 + 1);
    expect(preview?.endsWith('…')).toBe(true);
  });

  it('survives a value that cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(toToolPreview(circular)).toBe('[unserializable result]');
  });

  it('falls back to a plain string when JSON gives nothing back', () => {
    // JSON.stringify returns undefined for a function value.
    expect(toToolPreview(() => 'x')).toContain('=>');
  });
});

describe('stripToolPayloads', () => {
  const toolMessage: ChatMessage = {
    id: 'tool-1',
    role: 'tool',
    content: 'list_orders',
    timestamp: 1,
    tool: {
      name: 'list_orders',
      status: 'success',
      durationMs: 12,
      arguments: { customer_email: 'someone@example.com', token: 'sk_live_x' },
      resultPreview: '{"orders":[{"email":"someone@example.com"}]}',
    },
  };

  it('keeps what ran but drops the arguments and result', () => {
    const [stripped] = stripToolPayloads([toolMessage]);

    expect(stripped.tool).toEqual({ name: 'list_orders', status: 'success', durationMs: 12 });
    expect(JSON.stringify(stripped)).not.toContain('sk_live_x');
    expect(JSON.stringify(stripped)).not.toContain('someone@example.com');
  });

  it('leaves ordinary messages untouched', () => {
    const chat: ChatMessage = { id: 'm1', role: 'user', content: 'hello', timestamp: 1 };

    expect(stripToolPayloads([chat, toolMessage])[0]).toBe(chat);
  });

  it('tolerates a tool message with no payload', () => {
    const bare: ChatMessage = { id: 'm2', role: 'tool', content: 'x', timestamp: 1 };

    expect(stripToolPayloads([bare])[0]).toBe(bare);
  });
});
