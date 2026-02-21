import { useState, useEffect, useMemo, memo, useRef } from 'react';
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

type CopyTarget = 'message' | 'tool' | 'error';

export const MessageItem = memo(function MessageItem({
  event,
  isExpanded,
  onToggle,
  onCopy,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [toolPayloadView, setToolPayloadView] = useState<'pretty' | 'raw'>('pretty');
  const [showFullToolPayload, setShowFullToolPayload] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setShowFullToolPayload(false);
    }
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

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

  const handleCopy = (text: string, target: CopyTarget = 'message') => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copyResetTimerRef.current) {
          window.clearTimeout(copyResetTimerRef.current);
        }
        setCopied(true);
        setCopyTarget(target);
        copyResetTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          setCopyTarget((previous) => (previous === target ? null : previous));
        }, 1700);
        onCopy?.(text);
      })
      .catch(() => {});
  };

  const renderContent = () => {
    switch (event.type) {
      case 'message':
        return (
          <div className="relative rounded-2xl border border-white/5 p-4 group/message">
            <div
              className={clsx(
                'absolute inset-0 pointer-events-none',
                event.role === 'user'
                  ? 'bg-gradient-to-br from-brand-500/8 to-transparent'
                  : 'bg-gradient-to-br from-slate-700/8 to-transparent'
              )}
            />
            <div className="relative flex items-start gap-3">
              <div
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm',
                  event.role === 'user'
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white'
                    : 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-100'
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
                  <p className="text-sm font-semibold text-slate-200">
                    {event.role === 'user' ? 'You' : 'Agent'}
                  </p>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">
                    {event.role}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(event._timestamp)}
                  </span>
                </div>
                <div className="prose prose-invert max-w-none prose-p:leading-relaxed">
                  {event.role === 'assistant' ? (
                    <Markdown content={event.content} />
                  ) : (
                    <p className="whitespace-pre-wrap text-slate-200">{event.content}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleCopy(event.content, 'message')}
                type="button"
                className="absolute top-3 right-3 rounded-lg bg-slate-800/60 border border-slate-700/50 p-1.5 hover:bg-slate-700 opacity-0 group-hover/message:opacity-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                title="Copy message"
                aria-label="Copy message to clipboard"
              >
                {copied && copyTarget === 'message' ? (
                  <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        );

      case 'thinking':
        return (
          <div
            className="flex items-center gap-2 rounded-xl bg-slate-800/40 border border-slate-700/60 px-4 py-2 text-slate-400 text-sm"
            role="status"
          >
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" aria-hidden="true" />
            <span>{event.content}</span>
          </div>
        );

      case 'tool_call': {
        const isPreviewTruncated = toolPayloadPreview?.truncated ?? false;
        const payloadPanelId = `${event._id}-payload`;
        return (
          <div className="message-tool rounded-2xl border border-amber-500/25 bg-amber-500/6 p-4">
            <button
              type="button"
              onClick={() => onToggle(event._id)}
              aria-expanded={isExpanded}
              aria-controls={payloadPanelId}
              className="flex items-center gap-3 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-xl"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-amber-400" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-amber-300 truncate">Tool call</p>
                    <span className="text-xs text-amber-500/90 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10">
                      {event.tool_name}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatToolCallId(event.id)}
                  </span>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-amber-400" aria-hidden="true" />
              )}
            </button>
            {isExpanded && (
              <ToolPayloadPanel
                id={payloadPanelId}
                label="Arguments"
                text={toolPayloadText}
                isTruncated={isPreviewTruncated}
                showFull={showFullToolPayload}
                onToggleFull={() => setShowFullToolPayload((prev) => !prev)}
                view={toolPayloadView}
                onViewChange={setToolPayloadView}
                onCopy={() => handleCopy(toolPayloadText, 'tool')}
                copied={copied && copyTarget === 'tool'}
              />
            )}
          </div>
        );
      }

      case 'tool_result': {
        const isPreviewTruncated = toolPayloadPreview?.truncated ?? false;
        const payloadPanelId = `${event._id}-result-payload`;
        return (
          <div
            className={clsx(
              'ml-11 rounded-2xl border p-4',
              event.success
                ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                : 'border-rose-500/25 bg-rose-500/[0.05]'
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(event._id)}
              className="w-full flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-xl"
              aria-expanded={isExpanded}
              aria-controls={payloadPanelId}
              aria-label={`Tool result ${event.success ? 'success' : 'failed'} (${event.duration_ms}ms)`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    event.success ? 'bg-emerald-400' : 'bg-rose-400'
                  )}
                />
                <span className="text-sm text-slate-200">
                  Result: {event.success ? 'Success' : 'Failed'} · {event.duration_ms}ms
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {formatToolCallId(event.tool_call_id)}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
              )}
            </button>
            {isExpanded && (
              <ToolPayloadPanel
                id={payloadPanelId}
                label="Result"
                text={toolPayloadText}
                isTruncated={isPreviewTruncated}
                showFull={showFullToolPayload}
                onToggleFull={() => setShowFullToolPayload((prev) => !prev)}
                view={toolPayloadView}
                onViewChange={setToolPayloadView}
                onCopy={() => handleCopy(toolPayloadText, 'tool')}
                copied={copied && copyTarget === 'tool'}
              />
            )}
          </div>
        );
      }

      case 'log':
        return (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-300 mb-1">
                  Agent {event.level === 'debug' && <span className="text-slate-500">(debug)</span>}
                </p>
                <p className="whitespace-pre-wrap text-slate-300 break-words">{event.message}</p>
              </div>
            </div>
          </div>
        );

      case 'error':
        return (
          <div
            className="relative rounded-2xl border border-rose-700/40 bg-rose-900/15 p-4 overflow-hidden"
            role="alert"
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-rose-300">{event.code}</p>
                <p className="text-sm text-rose-200">{event.message}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(event.message, 'error')}
                className="rounded-lg border border-rose-500/30 bg-rose-900/20 px-2 py-1 text-rose-200/80 hover:bg-rose-900/30"
                title="Copy error details"
                aria-label="Copy error details"
              >
                {copied && copyTarget === 'error' ? (
                  <Check className="w-3.5 h-3.5 text-green-300" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
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
  id: string;
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
  id,
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
    <motion.div
      id={id}
      className="mt-3 overflow-hidden"
      initial={{ opacity: 0, y: 6, maxHeight: 0 }}
      animate={{ opacity: 1, y: 0, maxHeight: 500 }}
      exit={{ opacity: 0, y: -4, maxHeight: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
          {isTruncated && !showFull && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-600/30 bg-amber-900/20 text-amber-300">
              Preview truncated
            </span>
          )}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
            <button
              type="button"
              onClick={() => onViewChange('pretty')}
              aria-pressed={view === 'pretty'}
              className={clsx(
                'px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded',
                view === 'pretty'
                  ? 'bg-slate-800 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
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
                view === 'raw'
                  ? 'bg-slate-800 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
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
              className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
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
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
              text ? 'hover:bg-slate-800' : 'opacity-50 cursor-not-allowed'
            )}
            title={`Copy ${label.toLowerCase()}`}
            aria-label={`Copy tool ${label.toLowerCase()} to clipboard`}
            disabled={!text}
            aria-disabled={!text}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
            ) : (
              <Copy
                className={clsx('w-3.5 h-3.5', text ? 'text-slate-400' : 'text-slate-600')}
                aria-hidden="true"
              />
            )}
            <span className="hidden sm:inline">Copy</span>
          </button>
        </div>
      </div>
      {text ? (
        <pre className="max-h-80 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs overflow-auto text-slate-200 font-mono leading-5">
          {text}
        </pre>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-500">
          No payload available
        </div>
      )}
    </motion.div>
  );
}
