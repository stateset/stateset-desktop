import { useState, useEffect, useMemo, memo } from 'react';
import {
  Bot,
  User,
  Wrench,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { Markdown } from '../../../components/Markdown';
import type { StreamEvent } from '../../../hooks/useAgentStream';
import {
  formatTimestamp,
  formatToolCallId,
  buildJsonPreview,
  stringifyToolPayload,
  TOOL_PAYLOAD_PREVIEW_OPTIONS,
} from '../utils';

interface MessageItemProps {
  event: StreamEvent;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onCopy?: (text: string) => void;
}

export const MessageItem = memo(function MessageItem({
  event,
  isExpanded,
  onToggle,
  onCopy,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [toolPayloadView, setToolPayloadView] = useState<'pretty' | 'raw'>('pretty');
  const [showFullToolPayload, setShowFullToolPayload] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setShowFullToolPayload(false);
    }
  }, [isExpanded]);

  const toolPayloadRaw: unknown | null =
    event.type === 'tool_call'
      ? event.arguments
      : event.type === 'tool_result'
        ? event.result
        : null;

  const toolPayloadPreview = useMemo(() => {
    if (!isExpanded || toolPayloadRaw === null) return null;
    return buildJsonPreview(toolPayloadRaw, TOOL_PAYLOAD_PREVIEW_OPTIONS);
  }, [isExpanded, toolPayloadRaw]);

  const toolPayloadText = useMemo(() => {
    if (!isExpanded || toolPayloadRaw === null) return '';
    const pretty = toolPayloadView === 'pretty';
    if (showFullToolPayload || !toolPayloadPreview) {
      return stringifyToolPayload(toolPayloadRaw, pretty);
    }
    return stringifyToolPayload(toolPayloadPreview.value, pretty);
  }, [isExpanded, showFullToolPayload, toolPayloadRaw, toolPayloadPreview, toolPayloadView]);

  const handleCopy = (text: string) => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.(text);
      })
      .catch(() => {});
  };

  const renderContent = () => {
    switch (event.type) {
      case 'message':
        return (
          <div
            className={clsx(
              'rounded-xl p-4 group/message relative',
              event.role === 'user' ? 'message-user' : 'message-assistant'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  event.role === 'user' ? 'bg-brand-600' : 'bg-gray-700'
                )}
              >
                {event.role === 'user' ? (
                  <User className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Bot className="w-4 h-4" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-400">
                    {event.role === 'user' ? 'You' : 'Agent'}
                  </p>
                  <span className="text-xs text-gray-600">{formatTimestamp(event._timestamp)}</span>
                </div>
                {event.role === 'assistant' ? (
                  <Markdown content={event.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{event.content}</p>
                )}
              </div>
              <button
                onClick={() => handleCopy(event.content)}
                type="button"
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 opacity-0 group-hover/message:opacity-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                title="Copy message"
                aria-label="Copy message to clipboard"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        );

      case 'thinking':
        return (
          <div className="flex items-center gap-2 text-gray-400 text-sm" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>{event.content}</span>
          </div>
        );

      case 'tool_call': {
        const isPreviewTruncated = toolPayloadPreview?.truncated ?? false;
        return (
          <div className="message-tool rounded-xl p-4">
            <button
              type="button"
              onClick={() => onToggle(event._id)}
              className="flex items-center gap-2 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-lg"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-600/30 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-amber-400" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-amber-400 truncate">
                    Tool: {event.tool_name}
                  </p>
                  <span className="text-xs text-gray-600 font-mono">
                    {formatToolCallId(event.id)}
                  </span>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
              )}
            </button>
            {isExpanded && (
              <ToolPayloadPanel
                label="Arguments"
                text={toolPayloadText}
                isTruncated={isPreviewTruncated}
                showFull={showFullToolPayload}
                onToggleFull={() => setShowFullToolPayload((prev) => !prev)}
                view={toolPayloadView}
                onViewChange={setToolPayloadView}
                onCopy={() => handleCopy(toolPayloadText)}
                copied={copied}
              />
            )}
          </div>
        );
      }

      case 'tool_result': {
        const isPreviewTruncated = toolPayloadPreview?.truncated ?? false;
        return (
          <div className="ml-11 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <button
              type="button"
              onClick={() => onToggle(event._id)}
              className="w-full flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-lg"
              aria-expanded={isExpanded}
              aria-label={`Tool result ${event.success ? 'success' : 'failed'} (${event.duration_ms}ms)`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    event.success ? 'bg-green-500' : 'bg-red-500'
                  )}
                />
                <span className="text-sm text-gray-400">
                  Tool result: {event.success ? 'Success' : 'Failed'} ({event.duration_ms}ms)
                </span>
                <span className="text-xs text-gray-600 font-mono">
                  {formatToolCallId(event.tool_call_id)}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
              )}
            </button>
            {isExpanded && (
              <ToolPayloadPanel
                label="Result"
                text={toolPayloadText}
                isTruncated={isPreviewTruncated}
                showFull={showFullToolPayload}
                onToggleFull={() => setShowFullToolPayload((prev) => !prev)}
                view={toolPayloadView}
                onViewChange={setToolPayloadView}
                onCopy={() => handleCopy(toolPayloadText)}
                copied={copied}
              />
            )}
          </div>
        );
      }

      case 'log':
        return (
          <div className={clsx('rounded-xl p-4', 'message-assistant')}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-400 mb-1">
                  Agent {event.level === 'debug' && <span className="text-gray-500">(debug)</span>}
                </p>
                <p className="whitespace-pre-wrap">{event.message}</p>
              </div>
            </div>
          </div>
        );

      case 'error':
        return (
          <div
            className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-800 rounded-xl"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-red-400">{event.code}</p>
              <p className="text-sm text-red-300">{event.message}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {content}
    </motion.div>
  );
});

// ── Shared sub-component for tool call/result payloads ────────────────

interface ToolPayloadPanelProps {
  label: string;
  text: string;
  isTruncated: boolean;
  showFull: boolean;
  onToggleFull: () => void;
  view: 'pretty' | 'raw';
  onViewChange: (v: 'pretty' | 'raw') => void;
  onCopy: () => void;
  copied: boolean;
}

function ToolPayloadPanel({
  label,
  text,
  isTruncated,
  showFull,
  onToggleFull,
  view,
  onViewChange,
  onCopy,
  copied,
}: ToolPayloadPanelProps) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{label}</span>
          {isTruncated && !showFull && (
            <span className="text-[11px] px-2 py-0.5 rounded border border-amber-800/40 bg-amber-900/20 text-amber-300">
              Preview truncated
            </span>
          )}
          <div className="flex items-center rounded-md border border-gray-800 bg-gray-900 overflow-hidden">
            <button
              type="button"
              onClick={() => onViewChange('pretty')}
              aria-pressed={view === 'pretty'}
              className={clsx(
                'px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded',
                view === 'pretty'
                  ? 'bg-gray-800 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              Pretty
            </button>
            <button
              type="button"
              onClick={() => onViewChange('raw')}
              aria-pressed={view === 'raw'}
              className={clsx(
                'px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded',
                view === 'raw' ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              Raw
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTruncated && (
            <button
              type="button"
              onClick={onToggleFull}
              className="px-2 py-1 rounded-md bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs text-gray-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              aria-label={
                showFull
                  ? `Show preview ${label.toLowerCase()}`
                  : `Show full ${label.toLowerCase()}`
              }
            >
              {showFull ? 'Show preview' : 'Show full'}
            </button>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs text-gray-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            title={`Copy ${label.toLowerCase()}`}
            aria-label={`Copy tool ${label.toLowerCase()} to clipboard`}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Copy</span>
          </button>
        </div>
      </div>
      <pre className="p-3 bg-gray-900 rounded-lg text-xs overflow-auto max-h-80">{text}</pre>
    </div>
  );
}
