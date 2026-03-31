import { useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import clsx from 'clsx';

interface MessageInputProps {
  input: string;
  canSend: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isManualMode: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export function MessageInput({
  input,
  canSend,
  isRunning,
  isPaused,
  isManualMode,
  onInputChange,
  onSend,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const MAX_LENGTH = 8000;
  const charCount = input.length;
  const charRatio = charCount / MAX_LENGTH;
  const showCounter = charRatio > 0.7;
  const isNearLimit = charRatio > 0.85;
  const isAtLimit = charRatio >= 1;
  const hasText = input.trim().length > 0;
  const canSubmit = canSend && hasText;
  const composerHint = canSend
    ? hasText
      ? 'Tip: Enter to send, Shift + Enter for newline.'
      : 'Type a message to send to the agent.'
    : 'Start the agent to send messages.';
  const composerPlaceholder =
    isRunning || isPaused
      ? 'Send a message to the agent...'
      : isManualMode
        ? 'Send a message to start the agent...'
        : 'Start the agent to send messages';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, 170);
    textarea.style.height = `${nextHeight}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        onSend();
      }
    }
  };

  return (
    <div className="px-4 py-3 border-t border-slate-700/45 bg-slate-900/20">
      <div className="flex items-end gap-3">
        <div
          className={clsx(
            'flex-1 min-w-0 bg-slate-900/50 rounded-2xl border transition-all',
            isAtLimit
              ? 'border-rose-500/60 shadow-lg shadow-rose-500/10'
              : isNearLimit
                ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
                : 'border-slate-700/50 focus-within:border-brand-500 focus-within:shadow-lg focus-within:shadow-brand-500/10'
          )}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={composerPlaceholder}
            disabled={!canSend}
            id="agent-message-input"
            rows={1}
            aria-label="Message to agent"
            aria-describedby="agent-message-hint"
            maxLength={MAX_LENGTH}
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 text-sm min-h-[3rem] max-h-44 leading-6 overflow-y-auto"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSubmit}
          className="p-3 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-gray-500 rounded-xl border border-brand-600/50 transition-all shadow-sm shadow-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          title={
            canSubmit
              ? 'Send message (Enter)'
              : !canSend
                ? 'Start the agent first'
                : 'Type a message to send'
          }
          aria-label={
            canSubmit
              ? 'Send message'
              : !canSend
                ? 'Start the agent first'
                : 'Type a message to send'
          }
        >
          <Send className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p id="agent-message-hint" className="text-[11px] text-slate-500">
          {composerHint}
        </p>
        {showCounter && (
          <span
            className={clsx(
              'text-[11px] tabular-nums font-medium transition-colors',
              isAtLimit ? 'text-rose-400' : isNearLimit ? 'text-amber-400' : 'text-slate-500'
            )}
          >
            {charCount.toLocaleString()}/{MAX_LENGTH.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
