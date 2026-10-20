import type { ComputerChat } from './types';

export interface ActionRecovery {
  kind: 'unbound' | 'changed' | 'unavailable' | 'result' | 'workflow' | 'unconfirmed';
  title: string;
  description: string;
  action?: 'resume' | 'refresh';
  actionLabel?: string;
}

/** Display guidance only. Runtime identity and authorization checks remain authoritative. */
export function actionRecovery(chat: ComputerChat): ActionRecovery | undefined {
  const pending = chat.pending;
  if (!pending) return undefined;
  if (!pending.computer)
    return {
      kind: 'unbound',
      title: 'Action needs review',
      description:
        'This older action has no recorded computer identity. Its saved details remain available. Stop the computer and start a new chat to continue.',
    };
  const inspect =
    chat.session && !chat.stopped && !chat.sandboxStopRequested
      ? { action: 'refresh' as const, actionLabel: 'Check computer status' }
      : {};
  if (
    chat.stopped ||
    chat.sandboxStopRequested ||
    chat.session?.status !== 'running' ||
    !chat.session.currentSandboxId
  )
    return {
      kind: 'unavailable',
      title: 'Computer not ready',
      description:
        'The original computer must be running before this action can be recovered. Checking its status will not start a computer or run the action.',
      ...inspect,
    };
  if (
    chat.session.id !== pending.computer.sessionId ||
    chat.session.organizationId !== pending.computer.organizationId ||
    chat.session.currentSandboxId !== pending.computer.sandboxId
  )
    return {
      kind: 'changed',
      title: 'Computer changed',
      description:
        'This action belongs to an earlier computer. Its details are retained for inspection. Check the computer status, or stop the computer and start a new chat.',
      ...inspect,
    };
  if (pending.result)
    return {
      kind: 'result',
      title: 'Result awaiting review',
      description: `Execution reported exit code ${pending.result.exitCode}. Recovery checks the saved result without running the action again. This result has not been accepted yet.`,
      action: 'resume',
      actionLabel: pending.verify ? 'Verify saved result' : 'Recover saved result',
    };
  if (pending.workflowId)
    return {
      kind: 'workflow',
      title: 'Workflow unconfirmed',
      description:
        'The workflow already has an identity. Recovery checks that existing workflow without starting another one.',
      action: 'resume',
      actionLabel: 'Check workflow',
    };
  return {
    kind: 'unconfirmed',
    title: 'Action unconfirmed',
    description:
      'No execution result is recorded. Recovery reuses the original request on this computer. If it was not executed, recovery can run the original action.',
    action: 'resume',
    actionLabel: 'Recover action',
  };
}
