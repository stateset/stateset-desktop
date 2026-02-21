import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  Handshake,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import type { PendingApproval } from '../../../hooks/useAgentStream';

interface ApprovalDialogProps {
  approval: PendingApproval;
  onApprove: () => Promise<void>;
  onDeny: () => Promise<void>;
}

export function ApprovalDialog({ approval, onApprove, onDeny }: ApprovalDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await onApprove();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    setIsLoading(true);
    try {
      await onDeny();
    } finally {
      setIsLoading(false);
    }
  };

  const reasonLabel = approval.reason === 'budget_warning' ? 'Budget Warning' : approval.reason;

  const percentUsed = approval.details?.percentUsed;
  const hasDetails = Object.keys(approval.details ?? {}).length > 0;

  const detailRows = useMemo(() => {
    if (!approval.details) return [] as Array<[string, unknown]>;
    return Object.entries(approval.details)
      .filter(([key]) => key !== 'percentUsed')
      .slice(0, 6)
      .map(([key, value]) => [key, value] as const);
  }, [approval.details]);

  const percentage =
    typeof percentUsed === 'number' ? Math.max(0, Math.min(percentUsed, 100)) : null;
  const isHighUsage = percentage !== null && percentage >= 80;
  const budgetLabel = isHighUsage ? 'Budget running high' : 'Budget status';

  const stringifyValue = (value: unknown) => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return '—';

    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  };

  return (
    <Modal isOpen onClose={handleDeny} title="Approval Required" preventClose={isLoading}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-900/20 to-transparent p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-900/50 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-100">
                The agent session needs your approval to continue.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-full border border-amber-500/20 bg-amber-900/25">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                <p className="text-xs font-medium tracking-wide uppercase text-amber-200">
                  {reasonLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
          {typeof percentage === 'number' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 uppercase tracking-wide">Budget used</span>
                <span
                  className={clsx('font-mono', isHighUsage ? 'text-rose-300' : 'text-slate-200')}
                >
                  {Math.round(percentage)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.35 }}
                  title={budgetLabel}
                  className={clsx(
                    'h-full rounded-full',
                    isHighUsage ? 'bg-rose-400' : 'bg-amber-400'
                  )}
                />
              </div>
            </div>
          )}
          {!hasDetails && (
            <p className="mt-2 text-xs text-slate-400">
              There are no extra context details for this approval event.
            </p>
          )}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  View details
                </>
              )}
            </button>
          )}
          {showDetails && hasDetails && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
              {detailRows.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-500 uppercase tracking-wider w-28 shrink-0">
                    {key}
                  </span>
                  <span className="text-slate-200 break-all">{stringifyValue(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-400 mb-3">Choose an action to continue this run.</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" icon={XCircle} onClick={handleDeny} disabled={isLoading}>
              Deny
            </Button>
            <Button variant="primary" icon={Handshake} onClick={handleApprove} loading={isLoading}>
              Approve and continue
            </Button>
          </div>
        </div>
      </motion.div>
    </Modal>
  );
}
