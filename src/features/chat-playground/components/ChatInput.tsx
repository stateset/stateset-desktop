import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-700/45 px-4 py-3">
      <div className="flex items-end gap-3">
        <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-700/50 focus-within:border-brand-500 focus-within:shadow-lg focus-within:shadow-brand-500/10 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Type a message... (Shift+Enter for new line)'}
            rows={1}
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:opacity-50 text-sm"
            disabled={isLoading}
            aria-label="Chat message"
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
          className="p-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-gray-500 border border-brand-600/50 transition-all shadow-sm shadow-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
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
    </div>
  );
}
