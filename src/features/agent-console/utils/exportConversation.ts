import type { StreamEvent } from '../../../hooks/useAgentStream';

const safePretty = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
};

const formatCodeBlock = (language: string, content: string): string => {
  const matches = content.match(/`+/g);
  const maxTicks = matches ? Math.max(...matches.map((m) => m.length)) : 0;
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  return `${fence}${language}\n${content}\n${fence}`;
};

export function exportConversationMarkdown(
  messages: StreamEvent[],
  session: { id: string; agent_type: string } | null | undefined
): Blob {
  const exportData = messages
    .map((msg) => {
      const timestamp = new Date(msg._timestamp).toLocaleString();
      switch (msg.type) {
        case 'message': {
          const author =
            msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : 'System';
          return `[${timestamp}] ${author}:\n${msg.content}\n`;
        }
        case 'thinking':
          return `[${timestamp}] Agent (thinking):\n${msg.content}\n`;
        case 'tool_call': {
          const args = safePretty(msg.arguments);
          const lang =
            typeof msg.arguments === 'object' && msg.arguments !== null ? 'json' : 'text';
          return [
            `[${timestamp}] Tool call: ${msg.tool_name} (id: ${msg.id})`,
            formatCodeBlock(lang, args),
            '',
          ].join('\n');
        }
        case 'tool_result': {
          const result = safePretty(msg.result);
          const lang = typeof msg.result === 'object' && msg.result !== null ? 'json' : 'text';
          return [
            `[${timestamp}] Tool result: ${msg.success ? 'Success' : 'Failed'} (${msg.duration_ms}ms) (call id: ${msg.tool_call_id})`,
            formatCodeBlock(lang, result),
            '',
          ].join('\n');
        }
        case 'log': {
          const meta = msg.metadata ? safePretty(msg.metadata) : '';
          const metaBlock = msg.metadata ? `\n${formatCodeBlock('json', meta)}` : '';
          return `[${timestamp}] Log (${msg.level}):\n${msg.message}${metaBlock}\n`;
        }
        case 'error':
          return `[${timestamp}] Error (${msg.code})${msg.recoverable ? ' (recoverable)' : ''}:\n${msg.message}\n`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n---\n\n');

  return new Blob(
    [
      `# Agent Conversation Export\n`,
      `Agent ID: ${session?.id}\n`,
      `Type: ${session?.agent_type}\n`,
      `Exported: ${new Date().toLocaleString()}\n\n`,
      `---\n\n`,
      exportData,
    ],
    { type: 'text/markdown' }
  );
}

export function downloadConversation(
  messages: StreamEvent[],
  session: { id: string; agent_type: string } | null | undefined
): void {
  const blob = exportConversationMarkdown(messages, session);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-${session?.id?.slice(0, 8)}-conversation.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
