import { useCallback } from 'react';
import { useToast } from '../../../components/ToastProvider';
import {
  exportSessions,
  exportMetricsSummary,
  exportRunSummary,
  copyToClipboard,
} from '../../../lib/export';
import type { AgentSession } from '../../../types';

/**
 * Export/copy actions for the Dashboard, with toast feedback.
 * Delegates file generation to the shared helpers in `src/lib/export.ts`.
 */
export function useSessionExports(sessions: AgentSession[]) {
  const { showToast } = useToast();

  const handleExportJSON = useCallback(() => {
    exportSessions(sessions, { format: 'json' });
    showToast({
      variant: 'success',
      title: 'Exported as JSON',
      message: 'Agent data has been downloaded',
    });
  }, [sessions, showToast]);

  const handleExportCSV = useCallback(() => {
    exportSessions(sessions, { format: 'csv' });
    showToast({
      variant: 'success',
      title: 'Exported as CSV',
      message: 'Agent data has been downloaded',
    });
  }, [sessions, showToast]);

  const handleExportMetrics = useCallback(() => {
    exportMetricsSummary(sessions);
    showToast({
      variant: 'success',
      title: 'Metrics Exported',
      message: 'Metrics summary has been downloaded',
    });
  }, [sessions, showToast]);

  const handleCopySession = useCallback(
    async (session: AgentSession) => {
      const success = await copyToClipboard({
        id: session.id,
        agent_type: session.agent_type,
        status: session.status,
        metrics: session.metrics,
      });
      showToast({
        variant: success ? 'success' : 'error',
        title: success ? 'Copied to Clipboard' : 'Copy Failed',
        message: success ? 'Session data copied' : 'Failed to copy to clipboard',
      });
    },
    [showToast]
  );

  const handleExportRunSummary = useCallback(
    (session: AgentSession) => {
      exportRunSummary(session);
      showToast({
        variant: 'success',
        title: 'Summary Exported',
        message: 'Run summary has been downloaded',
      });
    },
    [showToast]
  );

  return {
    handleExportJSON,
    handleExportCSV,
    handleExportMetrics,
    handleCopySession,
    handleExportRunSummary,
  };
}
