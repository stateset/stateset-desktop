import { describe, it, expect } from 'vitest';
import {
  matchesStatusFilter,
  matchesTags,
  matchesSearch,
  filterSessions,
  collectAllTags,
  getSessionCounts,
  getFleetInsights,
  getStartableSelection,
  getStoppableSelection,
  STATUS_FILTERS,
} from './sessionFilters';
import { makeSession } from '../testing/fixtures';

// ── matchesStatusFilter ─────────────────────────────────────────────────

describe('matchesStatusFilter', () => {
  it('matches everything for "all"', () => {
    for (const status of ['running', 'paused', 'stopped', 'failed', 'starting'] as const) {
      expect(matchesStatusFilter(makeSession({ status }), 'all')).toBe(true);
    }
  });

  it('treats paused as running', () => {
    expect(matchesStatusFilter(makeSession({ status: 'running' }), 'running')).toBe(true);
    expect(matchesStatusFilter(makeSession({ status: 'paused' }), 'running')).toBe(true);
    expect(matchesStatusFilter(makeSession({ status: 'stopped' }), 'running')).toBe(false);
  });

  it('does not include failed in "stopped"', () => {
    expect(matchesStatusFilter(makeSession({ status: 'stopped' }), 'stopped')).toBe(true);
    expect(matchesStatusFilter(makeSession({ status: 'failed' }), 'stopped')).toBe(false);
  });

  it('matches only failed for "failed"', () => {
    expect(matchesStatusFilter(makeSession({ status: 'failed' }), 'failed')).toBe(true);
    expect(matchesStatusFilter(makeSession({ status: 'stopped' }), 'failed')).toBe(false);
  });

  it('exposes the full filter list', () => {
    expect(STATUS_FILTERS).toEqual(['all', 'running', 'stopped', 'failed']);
  });
});

// ── matchesTags ─────────────────────────────────────────────────────────

describe('matchesTags', () => {
  it('matches all sessions when no tags selected', () => {
    expect(matchesTags(makeSession({ tags: null }), new Set())).toBe(true);
  });

  it('matches when session has at least one selected tag', () => {
    const session = makeSession({ tags: ['prod', 'support'] });
    expect(matchesTags(session, new Set(['prod']))).toBe(true);
    expect(matchesTags(session, new Set(['other', 'support']))).toBe(true);
  });

  it('does not match when session has no selected tag', () => {
    expect(matchesTags(makeSession({ tags: ['prod'] }), new Set(['dev']))).toBe(false);
    expect(matchesTags(makeSession({ tags: null }), new Set(['dev']))).toBe(false);
  });
});

// ── matchesSearch ───────────────────────────────────────────────────────

describe('matchesSearch', () => {
  it('matches everything for empty query', () => {
    expect(matchesSearch(makeSession(), '')).toBe(true);
  });

  it('matches agent type case-insensitively', () => {
    expect(matchesSearch(makeSession({ agent_type: 'Support' }), 'sup')).toBe(true);
  });

  it('matches id, status, and tags', () => {
    const session = makeSession({ id: 'abc-123', status: 'failed', tags: ['Billing'] });
    expect(matchesSearch(session, 'abc-1')).toBe(true);
    expect(matchesSearch(session, 'FAIL')).toBe(true);
    expect(matchesSearch(session, 'billing')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesSearch(makeSession({ agent_type: 'support', tags: [] }), 'zzz')).toBe(false);
  });

  it('does not match session name (search covers type/id/status/tags only)', () => {
    expect(matchesSearch(makeSession({ name: 'My Custom Agent' }), 'custom')).toBe(false);
  });
});

// ── filterSessions ──────────────────────────────────────────────────────

describe('filterSessions', () => {
  const sessions = [
    makeSession({ id: 'a', status: 'running', agent_type: 'support', tags: ['prod'] }),
    makeSession({ id: 'b', status: 'paused', agent_type: 'orders', tags: ['dev'] }),
    makeSession({ id: 'c', status: 'stopped', agent_type: 'support', tags: [] }),
    makeSession({ id: 'd', status: 'failed', agent_type: 'billing', tags: ['prod'] }),
  ];

  it('returns all sessions with no active filters', () => {
    expect(
      filterSessions(sessions, { statusFilter: 'all', selectedTags: new Set(), search: '' })
    ).toHaveLength(4);
  });

  it('filters by status', () => {
    const result = filterSessions(sessions, {
      statusFilter: 'running',
      selectedTags: new Set(),
      search: '',
    });
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('filters by tags', () => {
    const result = filterSessions(sessions, {
      statusFilter: 'all',
      selectedTags: new Set(['prod']),
      search: '',
    });
    expect(result.map((s) => s.id)).toEqual(['a', 'd']);
  });

  it('filters by search', () => {
    const result = filterSessions(sessions, {
      statusFilter: 'all',
      selectedTags: new Set(),
      search: 'support',
    });
    expect(result.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('combines status, tags, and search', () => {
    const result = filterSessions(sessions, {
      statusFilter: 'running',
      selectedTags: new Set(['prod']),
      search: 'support',
    });
    expect(result.map((s) => s.id)).toEqual(['a']);
  });
});

// ── collectAllTags ──────────────────────────────────────────────────────

describe('collectAllTags', () => {
  it('returns unique tags sorted alphabetically', () => {
    const sessions = [
      makeSession({ tags: ['zeta', 'alpha'] }),
      makeSession({ tags: ['alpha', 'mid'] }),
      makeSession({ tags: null }),
    ];
    expect(collectAllTags(sessions)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('returns an empty array for no tags', () => {
    expect(collectAllTags([makeSession({ tags: undefined })])).toEqual([]);
  });
});

// ── getSessionCounts ────────────────────────────────────────────────────

describe('getSessionCounts', () => {
  it('counts running (incl. paused), stopped (incl. failed), and failed', () => {
    const sessions = [
      makeSession({ status: 'running' }),
      makeSession({ status: 'paused' }),
      makeSession({ status: 'stopped' }),
      makeSession({ status: 'failed' }),
      makeSession({ status: 'starting' }),
    ];
    expect(getSessionCounts(sessions)).toEqual({
      runningCount: 2,
      stoppedCount: 2,
      failedCount: 1,
    });
  });

  it('returns zeros for empty list', () => {
    expect(getSessionCounts([])).toEqual({ runningCount: 0, stoppedCount: 0, failedCount: 0 });
  });
});

// ── getFleetInsights ────────────────────────────────────────────────────

describe('getFleetInsights', () => {
  it('aggregates uptime, cost, tokens, and errors', () => {
    const sessions = [
      makeSession({
        metrics: {
          loop_count: 1,
          tokens_used: 1000,
          tool_calls: 0,
          errors: 2,
          messages_sent: 0,
          uptime_seconds: 100,
          estimated_cost_cents: 50,
        },
      }),
      makeSession({
        metrics: {
          loop_count: 1,
          tokens_used: 3000,
          tool_calls: 0,
          errors: 1,
          messages_sent: 0,
          uptime_seconds: 200,
        },
      }),
    ];
    expect(getFleetInsights(sessions)).toEqual({
      totalUptimeSeconds: 300,
      totalCostCents: 50,
      avgTokensPerAgent: 2000,
      totalErrors: 3,
    });
  });

  it('returns zero averages for empty list', () => {
    expect(getFleetInsights([])).toEqual({
      totalUptimeSeconds: 0,
      totalCostCents: 0,
      avgTokensPerAgent: 0,
      totalErrors: 0,
    });
  });
});

// ── selection helpers ───────────────────────────────────────────────────

describe('getStartableSelection / getStoppableSelection', () => {
  const sessions = [
    makeSession({ id: 'run', status: 'running' }),
    makeSession({ id: 'pause', status: 'paused' }),
    makeSession({ id: 'stop', status: 'stopped' }),
    makeSession({ id: 'fail', status: 'failed' }),
  ];

  it('startable selection includes only selected stopped/failed sessions', () => {
    const selected = new Set(['run', 'stop', 'fail']);
    expect(getStartableSelection(sessions, selected).map((s) => s.id)).toEqual(['stop', 'fail']);
  });

  it('stoppable selection includes only selected running/paused sessions', () => {
    const selected = new Set(['run', 'pause', 'stop']);
    expect(getStoppableSelection(sessions, selected).map((s) => s.id)).toEqual(['run', 'pause']);
  });

  it('returns empty arrays for empty selection', () => {
    expect(getStartableSelection(sessions, new Set())).toEqual([]);
    expect(getStoppableSelection(sessions, new Set())).toEqual([]);
  });
});
