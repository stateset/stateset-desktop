import { Bot, User, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../../../types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  const senderLabel = isUser ? 'You' : isSystem ? 'System' : 'Assistant';

  return (
    <div className={clsx('flex gap-3 animate-fade-in', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-brand-600'
            : isSystem
              ? 'bg-red-600/20'
              : 'bg-gradient-to-br from-brand-500 to-brand-600'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : isSystem ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div
        className={clsx(
          'max-w-[76%] rounded-2xl px-4 py-3 border',
          isUser
            ? 'message-user'
            : isSystem
              ? 'bg-red-900/20 border-red-800/50'
              : 'message-assistant'
        )}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-gray-500 font-medium">{senderLabel}</span>
          <span className="text-[10px] text-gray-500">•</span>
          <span className="text-[10px] text-gray-600">{timestamp}</span>
          {message.durationMs !== undefined && (
            <span className="text-[10px] text-gray-600">{message.durationMs}ms</span>
          )}
        </div>
      </div>
    </div>
  );
}
