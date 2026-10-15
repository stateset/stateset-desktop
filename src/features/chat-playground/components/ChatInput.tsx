import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  maxBytes?: number;
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder,
  disabled = false,
  value,
  onChange,
  onBlur,
  maxBytes,
}: ChatInputProps) {
  const [localInput, setInput] = useState('');
  const input = value ?? localInput;
  const bytes = maxBytes === undefined ? 0 : new TextEncoder().encode(input.trim()).byteLength;
  const tooLong = maxBytes !== undefined && bytes > maxBytes;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sizeDescription = useId();
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(160, textarea.scrollHeight)}px`;
  }, [input]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isLoading || disabled || tooLong) return;
    onSend(input);
    // A controlled composer clears only when its owner has retained the submission.
    if (value === undefined) setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-composer border-t border-slate-700/45 px-4 py-3">
      <div className="chat-composer-inner flex items-end gap-3">
        <div className="chat-composer-field flex-1 bg-slate-900/50 rounded-2xl border border-slate-700/50 focus-within:border-brand-500 focus-within:shadow-lg focus-within:shadow-brand-500/10 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              if (value === undefined) setInput(e.target.value);
              onChange?.(e.target.value);
            }}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Type a message... (Shift+Enter for new line)'}
            rows={1}
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:opacity-50 text-sm"
            disabled={isLoading || disabled}
            aria-label="Chat message"
            aria-invalid={tooLong || undefined}
            aria-describedby={maxBytes !== undefined && bytes > 0 ? sizeDescription : undefined}
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading || disabled || tooLong}
          aria-label="Send message"
          className="chat-send-button p-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-gray-500 border border-brand-600/50 transition-all shadow-sm shadow-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
        >
          {isLoading ? (
            <div
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Send className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {maxBytes !== undefined && bytes > 0 && (
        <p
          id={sizeDescription}
          role={tooLong ? 'alert' : undefined}
          className={`mt-2 text-xs ${tooLong ? 'text-red-300' : 'text-gray-400'}`}
        >
          {bytes.toLocaleString()} / {maxBytes.toLocaleString()} bytes
          {tooLong ? ' — shorten the message to send it.' : ''}
        </p>
      )}
    </div>
  );
}
