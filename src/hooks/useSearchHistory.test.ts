/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchHistory, useRecentSearches } from './useSearchHistory';

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts with empty history', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.recentSearches).toEqual([]);
    expect(result.current.savedFilters).toEqual([]);
  });

  it('adds search to history', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('test query');
    });
    expect(result.current.recentSearches).toEqual(['test query']);
  });

  it('deduplicates and moves to front', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('first');
      result.current.addToHistory('second');
      result.current.addToHistory('first'); // duplicate
    });
    expect(result.current.recentSearches).toEqual(['first', 'second']);
  });

  it('limits to 10 items', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.addToHistory(`query-${i}`);
      }
    });
    expect(result.current.recentSearches).toHaveLength(10);
    expect(result.current.recentSearches[0]).toBe('query-14');
  });

  it('ignores empty/whitespace queries', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('');
      result.current.addToHistory('   ');
    });
    expect(result.current.recentSearches).toEqual([]);
  });

  it('removes item from history', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('keep');
      result.current.addToHistory('remove');
    });
    act(() => {
      result.current.removeFromHistory('remove');
    });
    expect(result.current.recentSearches).toEqual(['keep']);
  });

  it('clears history', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('a');
      result.current.addToHistory('b');
    });
    act(() => {
      result.current.clearHistory();
    });
    expect(result.current.recentSearches).toEqual([]);
  });

  it('saves and removes filters', () => {
    const { result } = renderHook(() => useSearchHistory());
    let filterId: string;
    act(() => {
      filterId = result.current.saveFilter('My Filter', 'query', 'running');
    });
    expect(result.current.savedFilters).toHaveLength(1);
    expect(result.current.savedFilters[0].name).toBe('My Filter');

    act(() => {
      result.current.removeFilter(filterId!);
    });
    expect(result.current.savedFilters).toEqual([]);
  });

  it('updates filter', () => {
    const { result } = renderHook(() => useSearchHistory());
    let filterId: string;
    act(() => {
      filterId = result.current.saveFilter('Old', 'q', 'all');
    });
    act(() => {
      result.current.updateFilter(filterId!, { name: 'New' });
    });
    expect(result.current.savedFilters[0].name).toBe('New');
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addToHistory('persisted');
    });

    const raw =
      sessionStorage.getItem('stateset:search-history') ||
      localStorage.getItem('stateset:search-history') ||
      '{}';
    const stored = JSON.parse(raw);
    expect(stored.recentSearches).toContain('persisted');
  });

  it('loads from localStorage', () => {
    localStorage.setItem(
      'stateset:search-history',
      JSON.stringify({ recentSearches: ['loaded'], savedFilters: [] })
    );
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.recentSearches).toEqual(['loaded']);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem('stateset:search-history', 'not json');
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.recentSearches).toEqual([]);
  });
});

describe('useRecentSearches', () => {
  it('tracks recent searches without persistence', () => {
    const { result } = renderHook(() => useRecentSearches(3));
    act(() => {
      result.current.addSearch('a');
      result.current.addSearch('b');
      result.current.addSearch('c');
      result.current.addSearch('d');
    });
    expect(result.current.searches).toEqual(['d', 'c', 'b']);
  });

  it('clears searches', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.addSearch('x');
    });
    act(() => {
      result.current.clearSearches();
    });
    expect(result.current.searches).toEqual([]);
  });
});
