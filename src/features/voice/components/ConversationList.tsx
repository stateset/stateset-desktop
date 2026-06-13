import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { formatEventTime } from '../../../lib/voice/index';
import type { ConversationMessage } from '../utils';

interface ConversationListProps {
  conversation: ConversationMessage[];
  reduceMotion: boolean;
  endRef: RefObject<HTMLDivElement>;
}

export function ConversationList({ conversation, reduceMotion, endRef }: ConversationListProps) {
  return (
    <div className="flex-1 space-y-3" role="log" aria-label="Voice conversation">
      {conversation.map((message) => (
        <motion.div
          key={message.id}
          initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className={clsx(
            'flex',
            message.role === 'user'
              ? 'justify-end'
              : message.role === 'system'
                ? 'justify-center'
                : 'justify-start'
          )}
        >
          <div
            className={clsx(
              'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'bg-brand-500/15 border border-brand-500/25 text-gray-100'
                : message.role === 'assistant'
                  ? 'bg-slate-800/60 border border-slate-700/50 text-gray-200'
                  : 'bg-slate-900/40 border border-slate-700/40 text-slate-400 text-xs'
            )}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <p
              className={clsx(
                'mt-1.5 text-[10px]',
                message.role === 'user' ? 'text-brand-300/50 text-right' : 'text-slate-500'
              )}
            >
              {formatEventTime(message.timestamp)}
            </p>
          </div>
        </motion.div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
