import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePreferencesStore, type PageSize } from '../../../stores/preferences';
import { useDebounce } from '../../../hooks/useDebounce';
import { usePagination } from '../../../hooks/usePagination';
import { filterSessions, collectAllTags, type StatusFilter } from '../utils/sessionFilters';
import type { AgentSession } from '../../../types';

interface UseSessionFiltersOptions {
  /**
   * Called whenever the search query, status filter, or page size changes
   * (i.e. whenever the visible result set is reset to page 1). The Dashboard
   * uses this to clear the bulk selection.
   */
  onFilterChange?: () => void;
}

/**
 * Search / status / tag filtering plus pagination state for the sessions list.
 * Search input is debounced; changing search, status filter, or page size
 * resets pagination to page 1.
 */
export function useSessionFilters(
  sessions: AgentSession[],
  { onFilterChange }: UseSessionFiltersOptions = {}
) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = usePreferencesStore((s) => s.pageSize);
  const setPageSize = usePreferencesStore((s) => s.setPageSize);

  // Extract all unique tags across sessions
  const allTags = useMemo(() => collectAllTags(sessions), [sessions]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setSelectedTags(new Set()), []);

  // Filter sessions
  const filteredSessions = useMemo(
    () =>
      filterSessions(sessions, {
        statusFilter,
        selectedTags,
        search: debouncedSearch,
      }),
    [sessions, debouncedSearch, statusFilter, selectedTags]
  );

  // Pagination
  const { totalPages, getPageItems, itemsPerPage } = usePagination(filteredSessions, pageSize);
  const paginatedSessions = useMemo(() => getPageItems(currentPage), [getPageItems, currentPage]);

  const onFilterChangeRef = useRef(onFilterChange);
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
    onFilterChangeRef.current?.();
  }, [debouncedSearch, statusFilter, pageSize]);

  // Clamp current page when the total page count shrinks
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setSelectedTags(new Set());
  }, []);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size as PageSize);
    },
    [setPageSize]
  );

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || selectedTags.size > 0;

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    statusFilter,
    setStatusFilter,
    selectedTags,
    toggleTag,
    clearTags,
    allTags,
    filteredSessions,
    paginatedSessions,
    currentPage,
    setCurrentPage,
    totalPages,
    itemsPerPage,
    handlePageSizeChange,
    hasActiveFilters,
    clearFilters,
  };
}
