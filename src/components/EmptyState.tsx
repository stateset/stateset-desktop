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
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className={clsx(
        'relative flex flex-col items-center justify-center py-12 sm:py-14 px-4 overflow-hidden',
        className
      )}
    >
      <div className="absolute inset-x-10 top-4 h-32 bg-brand-500/8 blur-[60px] rounded-full pointer-events-none" />
      <div className="relative w-16 h-16 rounded-[1.25rem] bg-gradient-to-b from-slate-800/80 to-slate-800/40 border border-slate-700/40 flex items-center justify-center mb-5 shadow-inner backdrop-blur-sm animate-float">
        <Icon className="w-7 h-7 text-slate-300" aria-hidden="true" />
        <span className="absolute inset-0 rounded-[1.25rem] border border-brand-400/15" />
        <span className="absolute -inset-2 bg-brand-500/5 rounded-2xl blur-xl" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-1.5 tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm font-medium text-slate-400 text-center max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="group relative px-5 py-2.5 bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 rounded-xl font-medium border border-white/10 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-xl" />
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
