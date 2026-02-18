import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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

  return (
    <Modal isOpen onClose={handleDeny} title="Approval Required" preventClose={isLoading}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-900/30">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300">
            The agent session requires your approval to continue.
          </p>
          <div className="mt-2 rounded-lg bg-gray-800/50 p-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Reason</p>
            <p className="text-sm text-gray-200 mt-1">{reasonLabel}</p>
            {typeof percentUsed === 'number' && (
              <div className="mt-2">
                <p className="text-xs text-gray-400">Budget used: {Math.round(percentUsed)}%</p>
                <div className="mt-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.min(percentUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-800">
        <Button variant="secondary" onClick={handleDeny} disabled={isLoading}>
          Deny
        </Button>
        <Button variant="primary" onClick={handleApprove} loading={isLoading}>
          Approve & Continue
        </Button>
      </div>
    </Modal>
  );
}
