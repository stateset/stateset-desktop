import type { DurableChatStatus } from './durableTypes';

export { ExecutionTimeline } from './ExecutionTimeline';

export { ApprovalCard } from './ApprovalCard';

export function BudgetIndicator({ state }: { state: DurableChatStatus }) {
  const cost = typeof state.usage.total_cents === 'number' ? state.usage.total_cents : null;
  return (
    <section
      aria-label="Chat budget"
      className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950/40 p-3 text-[11px] text-gray-400 sm:grid-cols-4"
    >
      <span>
        Spend
        <br />
        <strong className="text-gray-200">
          {cost === null ? 'Pending' : `$${(cost / 100).toFixed(2)}`} / $
          {(state.budget.max_cost_cents / 100).toFixed(2)}
        </strong>
      </span>
      <span>
        Tokens
        <br />
        <strong className="text-gray-200">
          {state.tokens.toLocaleString()} / {state.budget.max_tokens.toLocaleString()}
        </strong>
      </span>
      <span>
        Actions
        <br />
        <strong className="text-gray-200">
          {state.actions} / {state.budget.max_actions}
        </strong>
      </span>
      <span>
        Runtime limit
        <br />
        <strong className="text-gray-200">
          {Math.ceil(state.budget.max_runtime_seconds / 60)} minutes
        </strong>
      </span>
    </section>
  );
}

export { Deliverables } from './Deliverables';
export { WorkspaceBrowser } from './WorkspaceBrowser';
