/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportConversationMarkdown, downloadConversation } from './exportConversation';
import type { StreamEvent } from '../../../hooks/useAgentStream';

const TIMESTAMP = new Date('2026-02-15T12:00:00Z').getTime();
const SESSION = { id: 'session-12345678-rest', agent_type: 'support' };

function event(partial: Record<string, unknown>): StreamEvent {
  return { _id: 'evt-1', _timestamp: TIMESTAMP, ...partial } as StreamEvent;
}

async function exportText(messages: StreamEvent[]): Promise<string> {
  return exportConversationMarkdown(messages, SESSION).text();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportConversationMarkdown', () => {
  it('returns a markdown blob with a header containing session metadata', async () => {
    const blob = exportConversationMarkdown([], SESSION);
    expect(blob.type).toBe('text/markdown');

    const text = await blob.text();
    expect(text).toContain('# Agent Conversation Export');
    expect(text).toContain('Agent ID: session-12345678-rest');
    expect(text).toContain('Type: support');
    expect(text).toContain('Exported:');
  });

  it('handles a null session', async () => {
    const text = await exportConversationMarkdown([], null).text();
    expect(text).toContain('Agent ID: undefined');
  });

  it('formats user, assistant and system messages with author labels', async () => {
    const text = await exportText([
      event({ type: 'message', id: 'm1', role: 'user', content: 'Hi' }),
      event({ type: 'message', id: 'm2', role: 'assistant', content: 'Hello back' }),
      event({ type: 'message', id: 'm3', role: 'system', content: 'Session note' }),
    ]);

    expect(text).toContain('You:\nHi');
    expect(text).toContain('Agent:\nHello back');
    expect(text).toContain('System:\nSession note');
    expect(text).toContain(new Date(TIMESTAMP).toLocaleString());
  });

  it('formats thinking events', async () => {
    const text = await exportText([event({ type: 'thinking', content: 'Considering options' })]);
    expect(text).toContain('Agent (thinking):\nConsidering options');
  });

  it('formats tool calls with JSON-fenced object arguments', async () => {
    const text = await exportText([
      event({
        type: 'tool_call',
        id: 'call-1',
        tool_name: 'get_order',
        arguments: { order_id: 'o-1' },
      }),
    ]);

    expect(text).toContain('Tool call: get_order (id: call-1)');
    expect(text).toContain('```json\n{\n  "order_id": "o-1"\n}\n```');
  });

  it('uses a text fence for non-object tool results', async () => {
    const text = await exportText([
      event({
        type: 'tool_result',
        tool_call_id: 'call-1',
        result: 'plain output',
        success: true,
        duration_ms: 42,
      }),
    ]);

    expect(text).toContain('Tool result: Success (42ms) (call id: call-1)');
    expect(text).toContain('```text\nplain output\n```');
  });

  it('marks failed tool results', async () => {
    const text = await exportText([
      event({
        type: 'tool_result',
        tool_call_id: 'call-2',
        result: { error: 'nope' },
        success: false,
        duration_ms: 7,
      }),
    ]);
    expect(text).toContain('Tool result: Failed (7ms) (call id: call-2)');
  });

  it('extends the code fence when content contains backtick runs', async () => {
    const text = await exportText([
      event({
        type: 'tool_result',
        tool_call_id: 'call-3',
        result: 'has ```` four ticks',
        success: true,
        duration_ms: 1,
      }),
    ]);

    // Content has a 4-backtick run, so the fence must be 5 backticks
    expect(text).toContain('`````text\nhas ```` four ticks\n`````');
  });

  it('formats log events with optional metadata block', async () => {
    const withMeta = await exportText([
      event({ type: 'log', level: 'info', message: 'started', metadata: { loop: 1 } }),
    ]);
    expect(withMeta).toContain('Log (info):\nstarted');
    expect(withMeta).toContain('```json\n{\n  "loop": 1\n}\n```');

    const withoutMeta = await exportText([
      event({ type: 'log', level: 'warn', message: 'careful' }),
    ]);
    expect(withoutMeta).toContain('Log (warn):\ncareful');
    expect(withoutMeta).not.toContain('```');
  });

  it('formats error events and flags recoverable ones', async () => {
    const text = await exportText([
      event({ type: 'error', code: 'E1', message: 'fatal issue', recoverable: false }),
      event({ type: 'error', code: 'E2', message: 'retryable issue', recoverable: true }),
    ]);

    expect(text).toContain('Error (E1):\nfatal issue');
    expect(text).toContain('Error (E2) (recoverable):\nretryable issue');
  });

  it('skips unsupported event types and joins entries with separators', async () => {
    const text = await exportText([
      event({ type: 'message', id: 'm1', role: 'user', content: 'one' }),
      event({ type: 'heartbeat', timestamp: 'x' }),
      event({ type: 'message', id: 'm2', role: 'user', content: 'two' }),
    ]);

    expect(text).toContain('one');
    expect(text).toContain('two');
    expect(text).not.toContain('heartbeat');
    // Exactly one separator joins the two rendered entries (one more in the header)
    expect(text.match(/---/g)).toHaveLength(2);
  });
});

describe('downloadConversation', () => {
  it('creates and clicks a download link named after the session', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      downloadConversation([event({ type: 'message', id: 'm1', role: 'user', content: 'hi' })], {
        id: 'session-12345678-rest',
        agent_type: 'support',
      });

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
      // Anchor is removed from the DOM afterwards
      expect(document.querySelector('a')).toBeNull();

      const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
      expect(anchor.download).toBe('agent-session--conversation.md');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
