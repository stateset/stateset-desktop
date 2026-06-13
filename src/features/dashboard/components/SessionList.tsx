import { Bot, Search } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { SkeletonCard } from '../../../components/Skeleton';
import { EmptyState } from '../../../components/EmptyState';
import { Pagination } from '../../../components/Pagination';
import { DashboardSessionRow } from './DashboardSessionRow';
import { listContainerVariants, listItemVariants } from '../../../lib/animations';
import type { AgentSession } from '../../../types';

interface SessionListProps {
  isLoading: boolean;
  /** Total number of sessions before filtering. */
  totalCount: number;
  /** Sessions after filtering, before pagination. */
  filteredSessions: AgentSession[];
  /** Sessions for the current page. */
  paginatedSessions: AgentSession[];
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  selectedIds: Set<string>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onCreate: () => void;
  onClearFilters: () => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRowClick: (id: string) => void;
  onCopy: (session: AgentSession) => void;
  onExportSummary: (session: AgentSession) => void;
  onRename: (id: string, name: string) => void;
  onToggleSelect: (id: string) => void;
}

/**
 * Sessions list body: loading skeletons, empty states, the animated
 * session rows, and pagination.
 */
export function SessionList({
  isLoading,
  totalCount,
  filteredSessions,
  paginatedSessions,
  currentPage,
  totalPages,
  itemsPerPage,
  selectedIds,
  onPageChange,
  onPageSizeChange,
  onCreate,
  onClearFilters,
  onStart,
  onStop,
  onRowClick,
  onCopy,
  onExportSummary,
  onRename,
  onToggleSelect,
}: SessionListProps) {
  const reduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <div className="p-4 space-y-3" role="status" aria-label="Loading sessions">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="Launch your first agent"
        description="Agents autonomously handle customer service, process orders, and manage workflows. Create one to get started."
        action={{
          label: 'Create Agent',
          onClick: onCreate,
        }}
      />
    );
  }

  if (filteredSessions.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No matching agents"
        description="Try adjusting your search or filter criteria."
        action={{
          label: 'Clear Filters',
          onClick: onClearFilters,
        }}
      />
    );
  }

  return (
    <>
      <motion.div
        className="divide-y divide-slate-800/80"
        variants={listContainerVariants}
        initial={reduceMotion ? 'visible' : 'hidden'}
        animate="visible"
        key={currentPage}
        role="list"
        aria-label="Agent sessions"
      >
        {paginatedSessions.map((session) => (
          <motion.div key={session.id} variants={listItemVariants} role="listitem">
            <DashboardSessionRow
              session={session}
              onStart={onStart}
              onStop={onStop}
              onClick={onRowClick}
              onCopy={onCopy}
              onExportSummary={onExportSummary}
              onRename={onRename}
              isSelected={selectedIds.has(session.id)}
              onToggleSelect={onToggleSelect}
            />
          </motion.div>
        ))}
      </motion.div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredSessions.length}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
}
