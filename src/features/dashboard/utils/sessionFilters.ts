import type { AgentSession } from '../../../types';

export type StatusFilter = 'all' | 'running' | 'stopped' | 'failed';

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'running', 'stopped', 'failed'];

export interface SessionFilterCriteria {
  statusFilter: StatusFilter;
  selectedTags: ReadonlySet<string>;
  search: string;
}

/**
 * Whether a session matches the given status filter.
 * "running" includes paused sessions; "stopped" excludes failed sessions.
 */
export function matchesStatusFilter(session: AgentSession, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return session.status === 'running' || session.status === 'paused';
  if (filter === 'stopped') return session.status === 'stopped';
  return session.status === 'failed';
}

/** Whether a session matches at least one of the selected tags (empty set matches all). */
export function matchesTags(session: AgentSession, selectedTags: ReadonlySet<string>): boolean {
  if (selectedTags.size === 0) return true;
  const sessionTags = session.tags || [];
  return sessionTags.some((tag) => selectedTags.has(tag));
}

/** Whether a session matches a free-text search across type, id, status, and tags. */
export function matchesSearch(session: AgentSession, search: string): boolean {
  if (!search) return true;
  const query = search.toLowerCase();
  return (
    session.agent_type.toLowerCase().includes(query) ||
    session.id.toLowerCase().includes(query) ||
    session.status.toLowerCase().includes(query) ||
    (session.tags || []).some((tag) => tag.toLowerCase().includes(query))
  );
}

/** Apply status, tag, and search filters to a list of sessions. */
export function filterSessions(
  sessions: AgentSession[],
  { statusFilter, selectedTags, search }: SessionFilterCriteria
): AgentSession[] {
  return sessions.filter(
    (session) =>
      matchesStatusFilter(session, statusFilter) &&
      matchesTags(session, selectedTags) &&
      matchesSearch(session, search)
  );
}

/** Collect all unique tags across sessions, sorted alphabetically. */
export function collectAllTags(sessions: AgentSession[]): string[] {
  const tagSet = new Set<string>();
  for (const session of sessions) {
    if (session.tags) {
      for (const tag of session.tags) {
        tagSet.add(tag);
      }
    }
  }
  return Array.from(tagSet).sort();
}

export interface SessionCounts {
  runningCount: number;
  stoppedCount: number;
  failedCount: number;
}

/**
 * Aggregate status counts: running includes paused, stopped includes failed
 * (matching the bulk start/stop/delete semantics).
 */
export function getSessionCounts(sessions: AgentSession[]): SessionCounts {
  return {
    runningCount: sessions.filter((s) => s.status === 'running' || s.status === 'paused').length,
    stoppedCount: sessions.filter((s) => s.status === 'stopped' || s.status === 'failed').length,
    failedCount: sessions.filter((s) => s.status === 'failed').length,
  };
}

export interface FleetInsights {
  totalUptimeSeconds: number;
  totalCostCents: number;
  avgTokensPerAgent: number;
  totalErrors: number;
}

/** Aggregate fleet-wide metrics for the sidebar overview. */
export function getFleetInsights(sessions: AgentSession[]): FleetInsights {
  return {
    totalUptimeSeconds: sessions.reduce((acc, s) => acc + s.metrics.uptime_seconds, 0),
    totalCostCents: sessions.reduce((acc, s) => acc + (s.metrics.estimated_cost_cents || 0), 0),
    avgTokensPerAgent:
      sessions.length > 0
        ? Math.round(sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0) / sessions.length)
        : 0,
    totalErrors: sessions.reduce((acc, s) => acc + s.metrics.errors, 0),
  };
}

/** Sessions in the current selection that can be started (stopped or failed). */
export function getStartableSelection(
  sessions: AgentSession[],
  selectedIds: ReadonlySet<string>
): AgentSession[] {
  return sessions.filter(
    (s) => selectedIds.has(s.id) && (s.status === 'stopped' || s.status === 'failed')
  );
}

/** Sessions in the current selection that can be stopped (running or paused). */
export function getStoppableSelection(
  sessions: AgentSession[],
  selectedIds: ReadonlySet<string>
): AgentSession[] {
  return sessions.filter(
    (s) => selectedIds.has(s.id) && (s.status === 'running' || s.status === 'paused')
  );
}
