/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionFilters } from './useSessionFilters';
import { usePreferencesStore } from '../../../stores/preferences';
import { makeSession } from '../testing/fixtures';
import type { AgentSession } from '../../../types';

describe('useSessionFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePreferencesStore.setState({ pageSize: 10 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderFilters(sessions: AgentSession[], onFilterChange?: () => void) {
    return renderHook(
      ({ sessions: s }: { sessions: AgentSession[] }) => useSessionFilters(s, { onFilterChange }),
      { initialProps: { sessions } }
    );
  }

  it('returns all sessions when no filters are active', () => {
    const sessions = [makeSession(), makeSession()];
    const { result } = renderFilters(sessions);
    expect(result.current.filteredSessions).toHaveLength(2);
    expect(result.current.paginatedSessions).toHaveLength(2);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('filters by status immediately', () => {
    const sessions = [
      makeSession({ status: 'running' }),
      makeSession({ status: 'paused' }),
      makeSession({ status: 'stopped' }),
    ];
    const { result } = renderFilters(sessions);

    act(() => result.current.setStatusFilter('running'));
    expect(result.current.filteredSessions).toHaveLength(2);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('debounces the search query by 300ms', () => {
    const sessions = [
      makeSession({ agent_type: 'support' }),
      makeSession({ agent_type: 'orders' }),
    ];
    const { result } = renderFilters(sessions);

    act(() => result.current.setSearchQuery('support'));
    // Not applied until the debounce elapses
    expect(result.current.filteredSessions).toHaveLength(2);
    expect(result.current.searchQuery).toBe('support');
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.filteredSessions).toHaveLength(1);
    expect(result.current.filteredSessions[0].agent_type).toBe('support');
  });

  it('toggles tags on and off', () => {
    const sessions = [makeSession({ tags: ['prod'] }), makeSession({ tags: ['dev'] })];
    const { result } = renderFilters(sessions);

    expect(result.current.allTags).toEqual(['dev', 'prod']);

    act(() => result.current.toggleTag('prod'));
    expect(result.current.filteredSessions).toHaveLength(1);
    expect(result.current.selectedTags.has('prod')).toBe(true);

    act(() => result.current.toggleTag('prod'));
    expect(result.current.filteredSessions).toHaveLength(2);

    act(() => result.current.toggleTag('dev'));
    act(() => result.current.clearTags());
    expect(result.current.selectedTags.size).toBe(0);
  });

  it('paginates by the preferences page size', () => {
    const sessions = Array.from({ length: 15 }, () => makeSession());
    const { result } = renderFilters(sessions);

    expect(result.current.totalPages).toBe(2);
    expect(result.current.itemsPerPage).toBe(10);
    expect(result.current.paginatedSessions).toHaveLength(10);

    act(() => result.current.setCurrentPage(2));
    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedSessions).toHaveLength(5);
  });

  it('resets to page 1 and notifies onFilterChange when filters change', () => {
    const onFilterChange = vi.fn();
    const sessions = Array.from({ length: 15 }, (_, i) =>
      makeSession({ status: i % 2 === 0 ? 'running' : 'stopped' })
    );
    const { result } = renderFilters(sessions, onFilterChange);
    onFilterChange.mockClear(); // ignore the mount-time invocation

    act(() => result.current.setCurrentPage(2));
    act(() => result.current.setStatusFilter('running'));

    expect(result.current.currentPage).toBe(1);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('clamps the current page when the result set shrinks', () => {
    const sessions = Array.from({ length: 15 }, () => makeSession());
    const { result, rerender } = renderFilters(sessions);

    act(() => result.current.setCurrentPage(2));
    expect(result.current.currentPage).toBe(2);

    rerender({ sessions: sessions.slice(0, 5) });
    expect(result.current.currentPage).toBe(1);
  });

  it('clearFilters resets search, status, and tags', () => {
    const sessions = [makeSession({ tags: ['prod'] })];
    const { result } = renderFilters(sessions);

    act(() => {
      result.current.setSearchQuery('foo');
      result.current.setStatusFilter('failed');
      result.current.toggleTag('prod');
    });
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.clearFilters());
    expect(result.current.searchQuery).toBe('');
    expect(result.current.statusFilter).toBe('all');
    expect(result.current.selectedTags.size).toBe(0);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('updates the page size through preferences', () => {
    const sessions = Array.from({ length: 30 }, () => makeSession());
    const { result } = renderFilters(sessions);

    act(() => result.current.handlePageSizeChange(25));
    expect(result.current.itemsPerPage).toBe(25);
    expect(result.current.paginatedSessions).toHaveLength(25);
  });
});
