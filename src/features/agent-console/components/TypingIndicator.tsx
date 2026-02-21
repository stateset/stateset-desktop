import { Bot } from 'lucide-react';
import { motion } from 'framer-motion';

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/25 to-brand-600/10 border border-brand-400/20 flex items-center justify-center">
          <Bot className="w-4 h-4 text-brand-300" />
        </div>
        <span className="absolute -inset-0.5 rounded-lg bg-brand-500/30 animate-ping opacity-40 pointer-events-none" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-300">Agent is thinking</p>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-brand-400/70 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-brand-400/70 rounded-full animate-bounce [animation-delay:120ms]" />
          <span className="w-2 h-2 bg-brand-400/70 rounded-full animate-bounce [animation-delay:240ms]" />
        </div>
      </div>
    </motion.div>
  );
}
