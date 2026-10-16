import type { AgentSession } from '../../../types';

export type SessionAction = 'start' | 'stop' | 'delete';

export interface BatchProgress {
  action: SessionAction;
  completed: number;
  total: number;
}

export interface BatchResult {
  action: SessionAction;
  total: number;
  succeeded: number;
  failed: AgentSession[];
  skipped: number;
}

export function canApplySessionAction(session: AgentSession, action: SessionAction): boolean {
  return action === 'stop'
    ? session.status === 'running' || session.status === 'paused'
    : session.status === 'stopped' || session.status === 'failed';
}

export function describeBatchResult(result: BatchResult): string {
  const verb = { start: 'started', stop: 'stopped', delete: 'deleted' }[result.action];
  if (result.failed.length === 0 && result.skipped === 0) {
    return `${result.succeeded} agent${result.succeeded === 1 ? '' : 's'} ${verb}.`;
  }
  return `${result.succeeded} ${verb}${result.failed.length ? `; ${result.failed.length} failed to ${result.action}` : ''}.${result.skipped ? ` ${result.skipped} not attempted because the workspace or agent status changed.` : ''}`;
}
