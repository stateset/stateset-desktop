import { memo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  showItemCount?: boolean;
}

export const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 10,
  showItemCount = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems || 0);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5; // Number of page buttons to show

    if (totalPages <= showPages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('ellipsis');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between py-4 px-5 border-t border-slate-700/60">
      {/* Item count */}
      {showItemCount && totalItems !== undefined && (
        <div className="text-sm font-medium text-gray-400">
          Showing {startItem}-{endItem} of {totalItems}
        </div>
      )}

      {/* Page controls */}
      <nav className="flex items-center gap-1" role="navigation" aria-label="Pagination">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={clsx(
            'p-2 rounded-xl transition-all border border-transparent shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            currentPage === 1
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:bg-slate-800/60 hover:border-slate-700/50 hover:text-gray-200'
          )}
          aria-label="Go to first page"
          title="First page"
        >
          <ChevronsLeft className="w-5 h-5" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={clsx(
            'p-2 rounded-xl transition-all border border-transparent shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            currentPage === 1
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:bg-slate-800/60 hover:border-slate-700/50 hover:text-gray-200'
          )}
          aria-label="Go to previous page"
          title="Previous page"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1.5 mx-2">
          {getPageNumbers().map((page, index) =>
            page === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 font-medium text-gray-500"
                aria-hidden="true"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={clsx(
                  'min-w-[36px] h-9 px-2 rounded-xl text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  currentPage === page
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 shadow-md shadow-brand-500/20 scale-105'
                    : 'text-gray-400 border border-transparent hover:border-slate-700/50 hover:bg-slate-800/60 hover:text-gray-200 shadow-sm hover:scale-[1.02]'
                )}
                aria-label={`Go to page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
              >
                {page}
              </button>
            )
          )}
        </div>

        {/* Next page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={clsx(
            'p-2 rounded-xl transition-all border border-transparent shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            currentPage === totalPages
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:bg-slate-800/60 hover:border-slate-700/50 hover:text-gray-200'
          )}
          aria-label="Go to next page"
          title="Next page"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={clsx(
            'p-2 rounded-xl transition-all border border-transparent shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            currentPage === totalPages
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:bg-slate-800/60 hover:border-slate-700/50 hover:text-gray-200'
          )}
          aria-label="Go to last page"
          title="Last page"
        >
          <ChevronsRight className="w-5 h-5" />
        </button>
      </nav>
    </div>
  );
});
