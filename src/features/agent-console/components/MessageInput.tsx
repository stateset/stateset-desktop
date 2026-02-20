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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 border-t border-gray-800">
      <div className="flex items-end gap-3">
        <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 focus-within:border-brand-500 transition-colors">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRunning || isPaused
                ? 'Send a message to the agent...'
                : isManualMode
                  ? 'Send a message to start the agent...'
                  : 'Start the agent to send messages'
            }
            disabled={!canSend}
            rows={1}
            aria-label="Message to agent"
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim() || !canSend}
          className="p-3 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl transition-all border border-brand-600/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          aria-label="Send message"
        >
          <Send className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
