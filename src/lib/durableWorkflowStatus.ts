const TERMINAL_STATUSES = new Set([
  'completed',
  'planner_done',
  'time_budget_exhausted',
  'turn_budget_exhausted',
  'failure_budget_exhausted',
  'cancelled',
  'failed',
  'terminated',
  'timed_out',
  'checkpoint_failed',
]);

export function isDurableWorkflowTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
