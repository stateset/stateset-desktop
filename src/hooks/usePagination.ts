/**
 * Hook for pagination state management
 */
export function usePagination<T>(items: T[], itemsPerPage: number = 10) {
  const totalItems = items.length;
  const safeItemsPerPage = Number.isFinite(itemsPerPage) && itemsPerPage > 0 ? itemsPerPage : 10;
  const totalPages = Math.ceil(totalItems / safeItemsPerPage);

  return {
    totalItems,
    totalPages,
    itemsPerPage: safeItemsPerPage,
    getPageItems: (currentPage: number) => {
      const start = (currentPage - 1) * safeItemsPerPage;
      const end = start + safeItemsPerPage;
      return items.slice(start, end);
    },
  };
}
