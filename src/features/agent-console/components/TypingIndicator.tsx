import { Bot } from 'lucide-react';
import { motion } from 'framer-motion';

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3 p-4"
    >
      <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
        <Bot className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-sm text-gray-500 ml-2">Agent is thinking...</span>
      </div>
    </motion.div>
  );
}
