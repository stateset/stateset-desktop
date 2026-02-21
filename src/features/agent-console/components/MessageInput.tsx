import { useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

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
        <div className="flex-1 min-w-0 bg-slate-900/50 rounded-2xl border border-slate-700/50 focus-within:border-brand-500 focus-within:shadow-lg focus-within:shadow-brand-500/10 transition-all">
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
            maxLength={8000}
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 text-sm min-h-[3rem] max-h-44 leading-6 overflow-y-auto"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSubmit}
          className="p-3 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-gray-500 rounded-xl border border-brand-600/50 transition-all shadow-sm shadow-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          aria-label={canSubmit ? 'Send message' : 'Cannot send message'}
        >
          <Send className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <p id="agent-message-hint" className="mt-2 text-[11px] text-slate-500">
        {composerHint}
      </p>
    </div>
  );
}
