import { useCallback } from 'react';

/**
 * Hook for pagination state management
 */
export function usePagination<T>(items: T[], itemsPerPage: number = 10) {
  const totalItems = items.length;
  const safeItemsPerPage = Number.isFinite(itemsPerPage) && itemsPerPage > 0 ? itemsPerPage : 10;
  const totalPages = Math.ceil(totalItems / safeItemsPerPage);
  const getPageItems = useCallback(
    (currentPage: number) => {
      const start = (currentPage - 1) * safeItemsPerPage;
      return items.slice(start, start + safeItemsPerPage);
    },
    [items, safeItemsPerPage]
  );

  return {
    totalItems,
    totalPages,
    itemsPerPage: safeItemsPerPage,
    getPageItems,
  };
}
