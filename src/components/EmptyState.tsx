import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx(
        'relative flex flex-col items-center justify-center py-10 sm:py-12 px-4 overflow-hidden',
        className
      )}
    >
      <div className="absolute inset-x-10 top-2 h-24 bg-brand-500/10 blur-3xl rounded-full pointer-events-none" />
      <div className="relative w-16 h-16 rounded-[2rem] bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-5 shadow-inner backdrop-blur-sm">
        <Icon className="w-7 h-7 text-slate-300" aria-hidden="true" />
        <span className="absolute inset-0 rounded-[2rem] border border-brand-400/20" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm font-medium text-slate-400 text-center max-w-sm mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-5 py-2.5 bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 rounded-xl font-medium border border-brand-500/50 shadow-sm shadow-brand-500/20 hover:shadow-brand-500/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
