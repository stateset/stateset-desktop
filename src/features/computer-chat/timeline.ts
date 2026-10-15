import type { DurableChatStatus } from './durableTypes';

export type WorkflowEvent = DurableChatStatus['events'][number];
export type TimelineFilter = 'all' | 'actions' | 'policy' | 'outputs' | 'attention';
const labels: Record<string, string> = {
  session_created: 'Computer session created',
  computer_ready: 'Computer ready',
  message_received: 'Request received',
  model_started: 'Agent reasoning',
  action_started: 'Action started',
  action_completed: 'Action finished',
  policy_evaluated: 'Policy evaluated',
  approval_requested: 'Approval needed',
  approval_granted: 'Action approved',
  approval_rejected: 'Action rejected',
  artifact_collected: 'Deliverable collected',
  deliverables_evaluated: 'Acceptance checks completed',
  checkpoint_created: 'Checkpoint saved',
  session_recovered: 'Session recovered',
  sandbox_rotated: 'Computer restored',
  computer_stopped: 'Computer stopped',
  needs_attention: 'Needs attention',
  budget_exhausted: 'Budget reached',
  mcp_connected: 'Tools connected',
};
const actions: Record<string, string> = {
  execute: 'Run command',
  screenshot: 'Capture screenshot',
  click: 'Click',
  type_text: 'Type text',
  press_key: 'Press key',
  mcp: 'Call tool',
  publish_artifact: 'Collect file',
  list_workspace: 'Browse workspace',
};
const verdicts: Record<string, string> = {
  allow: 'Allowed',
  deny: 'Denied',
  ask_user: 'Approval required',
  rewrite: 'Replacement proposed',
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const lookup = (values: Record<string, string>, key: string) =>
  Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;

export function presentEvent(event: WorkflowEvent) {
  const detail =
    event.detail && typeof event.detail === 'object' && !Array.isArray(event.detail)
      ? (event.detail as Record<string, unknown>)
      : {};
  const action = lookup(actions, text(detail.name)) ?? text(detail.name).replace(/_/g, ' ');
  let summary = '';
  let attention = [
    'needs_attention',
    'budget_exhausted',
    'approval_requested',
    'approval_rejected',
  ].includes(event.kind);
  if (event.kind === 'policy_evaluated') {
    const phase =
      detail.phase === 'admission'
        ? 'Before execution'
        : detail.phase === 'verification'
          ? 'Output policy'
          : 'Policy decision';
    summary = `${phase} · ${lookup(verdicts, text(detail.verdict)) ?? 'Decision unavailable'}`;
    attention = ['deny', 'ask_user', 'rewrite'].includes(text(detail.verdict));
  } else if (event.kind === 'deliverables_evaluated') {
    summary =
      detail.outcome === 'verified'
        ? 'Acceptance checks passed for the recorded files.'
        : detail.outcome === 'failed'
          ? 'Acceptance checks failed.'
          : detail.outcome === 'observed_only'
            ? 'Files observed without acceptance criteria.'
            : 'Acceptance outcome unavailable.';
    attention = detail.outcome === 'failed';
  } else if (event.kind === 'action_completed') {
    const exit =
      typeof detail.exit_code === 'number' && Number.isInteger(detail.exit_code)
        ? detail.exit_code
        : undefined;
    summary = [action, exit === undefined ? 'Exit code unavailable' : `Exit code ${exit}`]
      .filter(Boolean)
      .join(' · ');
    attention = exit !== undefined && exit !== 0;
  } else if (event.kind === 'action_started') {
    summary = action;
  } else if (event.kind === 'needs_attention') {
    summary = text(detail.message);
  } else if (event.kind === 'model_started') {
    summary = [typeof detail.turn === 'number' ? `Turn ${detail.turn}` : '', text(detail.model)]
      .filter(Boolean)
      .join(' · ');
  } else if (event.kind === 'computer_stopped') {
    summary =
      detail.confirmed === true
        ? 'Computer cleanup confirmed.'
        : 'Computer cleanup has not been confirmed.';
    attention = detail.confirmed !== true;
  } else if (event.kind === 'mcp_connected') {
    summary = text(detail.server);
  } else if (event.kind === 'artifact_collected') {
    summary = text(detail.path);
  }
  const category =
    event.kind.startsWith('approval_') || event.kind === 'policy_evaluated'
      ? 'policy'
      : ['artifact_collected', 'deliverables_evaluated'].includes(event.kind)
        ? 'outputs'
        : ['action_started', 'action_completed'].includes(event.kind)
          ? 'actions'
          : 'other';
  return {
    label: lookup(labels, event.kind) ?? event.kind.replace(/_/g, ' '),
    summary: summary.length > 600 ? `${summary.slice(0, 600)}…` : summary,
    attention,
    category,
  };
}

export function selectTimeline(events: WorkflowEvent[], filter: TimelineFilter, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return events
    .map((event) => ({ event, ...presentEvent(event) }))
    .filter((item) => {
      if (filter === 'attention' ? !item.attention : filter !== 'all' && item.category !== filter)
        return false;
      if (!terms.length) return true;
      const content = [item.label, item.summary, item.event.kind, JSON.stringify(item.event.detail)]
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => content.includes(term));
    })
    .sort((a, b) => b.event.id - a.event.id);
}
