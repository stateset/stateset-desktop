import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { useAuthStore } from '../stores/auth';
import { usePreferencesStore } from '../stores/preferences';
import { useUiStore } from '../stores/ui';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { usePageTitle } from '../hooks/usePageTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSessionsCache, useOnlineStatus } from '../hooks/useOfflineCache';
import { uiLogger } from '../lib/logger';
import { useAuditLogStore } from '../stores/auditLog';
import { CreateAgentDialog } from '../components/CreateAgentDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BatchActionNotice } from '../features/dashboard/components/BatchActionNotice';
import { SessionDataNotice } from '../features/dashboard/components/SessionDataNotice';
import { getStatusBreakdown } from '../features/dashboard/utils/sessionFilters';
import {
  DashboardStats,
  DashboardHeader,
  DashboardToolbar,
  BulkActionsBar,
  SessionList,
  FleetOverview,
  McpServersOverview,
  ShortcutsHint,
  RecentActivityTimeline,
  useSessionFilters,
  useSessionSelection,
  useSessionActions,
  useSessionExports,
  getGreeting,
  getSessionCounts,
  type StatusFilter,
} from '../features/dashboard';
import { requireTenantId, requireBrandId } from '../lib/auth-guards';
import { pageContainerVariants, pageSectionVariants } from '../lib/animations';
import type { AgentSession, AgentSessionConfig } from '../types';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const reduceMotion = useReducedMotionConfig();
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const refreshInterval = usePreferencesStore((s) => s.refreshInterval);
  const { handleMutationError } = useErrorHandler();

  // Online status for offline-first behavior
  const isOnline = useOnlineStatus();

  // Offline cache integration
  const { cacheFromQuery, getCachedSessions } = useSessionsCache(tenant?.id, currentBrand?.id);

  // Fetch sessions with offline cache fallback
  const {
    data: sessionData,
    isLoading,
    isFetching,
    error: sessionsError,
    errorUpdatedAt,
    refetch,
  } = useQuery<AgentSession[]>({
    queryKey: queryKeys.sessions.list(tenant?.id, currentBrand?.id),
    queryFn: async () => {
      // If offline, try to get cached data
      if (!isOnline) {
        const cached = await getCachedSessions();
        if (cached) {
          uiLogger.info('Using cached sessions (offline)', { count: cached.length });
          return cached;
        }
        throw new Error('No cached data available while offline');
      }

      const data = await agentApi.listSessions(requireTenantId(tenant), currentBrand?.id);
      // Cache the fresh data
      await cacheFromQuery(data);
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: isOnline ? refreshInterval : false,
  });

  const sessions = useMemo(() => sessionData ?? [], [sessionData]);
  const hasSessionData = sessionData !== undefined;
  // React Query clears an initial error while retrying; keep the recovery panel
  // visible until data arrives instead of swapping back to an empty dashboard.
  const showDataNotice = !!sessionsError || (!hasSessionData && errorUpdatedAt > 0) || !isOnline;
  const dataUnavailable = !hasSessionData && showDataNotice;

  // Selection, filtering/search/pagination, lifecycle actions, exports
  const selection = useSessionSelection();
  const filters = useSessionFilters(sessions, { onFilterChange: selection.clearSelection });
  // Bind actions to the rendered page immediately; prune stored selection after refresh.
  const selectedIds = useMemo(() => {
    const visibleIds = new Set(filters.paginatedSessions.map((session) => session.id));
    return new Set([...selection.selectedIds].filter((id) => visibleIds.has(id)));
  }, [filters.paginatedSessions, selection.selectedIds]);
  const { retainVisible } = selection;
  useEffect(() => {
    retainVisible(filters.paginatedSessions);
  }, [filters.paginatedSessions, retainVisible]);
  const actions = useSessionActions({
    sessions,
    selectedIds,
    clearSelection: selection.clearSelection,
  });
  const exports = useSessionExports(sessions);

  const { setSearchQuery, setStatusFilter } = filters;

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: '/',
      description: 'Focus search',
      action: () => searchInputRef.current?.focus(),
    },
    {
      key: 'Escape',
      description: 'Clear search',
      action: () => {
        setSearchQuery('');
        setStatusFilter('all');
        searchInputRef.current?.blur();
      },
    },
  ]);

  // Create session mutation
  type CreateAgentRequest = {
    agentType: string;
    config: Partial<AgentSessionConfig>;
    name?: string;
  };

  const createSession = useMutation({
    mutationFn: ({ agentType, config, name }: CreateAgentRequest) =>
      agentApi.createSession(
        requireTenantId(tenant),
        requireBrandId(currentBrand),
        agentType,
        config,
        name
      ),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      setShowCreateDialog(false);
      useAuditLogStore
        .getState()
        .log('agent.created', `Created agent "${session.name || session.id}"`, {
          sessionId: session.id,
          agentType: session.agent_type,
        });
      navigate(`/agent/${session.id}`);
    },
    onError: handleMutationError('Failed to create session'),
  });

  const handleCreateSession = () => {
    if (!currentBrand) return;
    setShowCreateDialog(true);
  };

  // Support global "create agent" navigation: `/?create=1`
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('create') !== '1') return;
    if (!currentBrand) return;

    setShowCreateDialog(true);

    params.delete('create');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [currentBrand, location.pathname, location.search, navigate]);

  const handleCreateAgent = async (
    agentType: string,
    config: Partial<AgentSessionConfig>,
    name?: string
  ) => {
    setIsCreating(true);
    try {
      await createSession.mutateAsync({ agentType, config, name });
    } finally {
      setIsCreating(false);
    }
  };

  // Stable callbacks for DashboardSessionRow (avoids defeating memo)
  const handleRowStart = actions.handleStartSession;
  const handleRowStop = actions.handleStopSession;
  const handleRowClick = useCallback((id: string) => navigate(`/agent/${id}`), [navigate]);

  const handleSelectAll = useCallback(
    () => selection.selectAllVisible(filters.paginatedSessions),
    [selection, filters.paginatedSessions]
  );

  // Stats
  const { runningCount, stoppedCount } = getSessionCounts(sessions);

  // Greeting
  const greeting = useMemo(() => getGreeting(), []);

  // Stat card click handler: toggle filter
  const handleStatClick = useCallback(
    (filter: string) => {
      setStatusFilter((prev) => (prev === filter ? 'all' : (filter as StatusFilter)));
    },
    [setStatusFilter]
  );

  return (
    <div className="page-shell">
      {/* Dialogs */}
      <CreateAgentDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreateAgent={handleCreateAgent}
        isCreating={isCreating}
      />
      <ConfirmDialog
        isOpen={actions.showDeleteConfirm}
        onClose={() => actions.setShowDeleteConfirm(false)}
        onConfirm={actions.handleDeleteStopped}
        title="Delete stopped agents?"
        message={`Delete up to ${actions.deleteCount} stopped or failed agent${actions.deleteCount === 1 ? '' : 's'} from this reviewed set. Agents added later are excluded; active agents are skipped. This cannot be undone.`}
        confirmLabel={`Delete ${actions.deleteCount} agent${actions.deleteCount === 1 ? '' : 's'}`}
        variant="danger"
        isLoading={actions.isDeletingStopped}
      />

      <motion.div
        variants={reduceMotion ? undefined : pageContainerVariants}
        initial={reduceMotion ? undefined : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
      >
        {/* Header */}
        <DashboardHeader
          greeting={greeting}
          sessionsCount={sessions.length}
          runningCount={getStatusBreakdown(sessions).running}
          isLoading={isLoading}
          isFetching={isFetching}
          isOnline={isOnline}
          isCreating={isCreating}
          canCreate={!!currentBrand}
          onOpenCommandPalette={openCommandPalette}
          onRefresh={() => refetch()}
          onCreate={handleCreateSession}
        />

        {showDataNotice && (
          <SessionDataNotice
            hasData={hasSessionData}
            isOnline={isOnline}
            isFetching={isFetching}
            onRetry={() => refetch()}
          />
        )}

        {!dataUnavailable && (
          <>
            {/* Stats */}
            <motion.div variants={reduceMotion ? undefined : pageSectionVariants}>
              <DashboardStats
                sessions={sessions}
                isLoading={isLoading}
                activeFilter={filters.statusFilter !== 'all' ? filters.statusFilter : null}
                onStatClick={handleStatClick}
              />
            </motion.div>

            {/* Main content: 2-column grid */}
            <motion.div variants={reduceMotion ? undefined : pageSectionVariants}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions panel - 2 columns */}
                <div className="lg:col-span-2">
                  <div className="dashboard-session-panel border rounded-xl overflow-hidden">
                    {/* Card header with integrated toolbar */}
                    <DashboardToolbar
                      searchQuery={filters.searchQuery}
                      statusFilter={filters.statusFilter}
                      allTags={filters.allTags}
                      selectedTags={filters.selectedTags}
                      runningCount={runningCount}
                      stoppedCount={stoppedCount}
                      sessionsCount={sessions.length}
                      filteredCount={filters.filteredSessions.length}
                      hasActiveFilters={filters.hasActiveFilters}
                      isStartingAll={actions.isStartingAll}
                      isStoppingAll={actions.isStoppingAll}
                      isDeletingStopped={actions.isDeletingStopped}
                      isBusy={actions.isActionBusy}
                      searchInputRef={searchInputRef}
                      onSearchChange={setSearchQuery}
                      onStatusFilterChange={setStatusFilter}
                      onToggleTag={filters.toggleTag}
                      onClearTags={filters.clearTags}
                      onStartAll={actions.handleStartAll}
                      onStopAll={actions.handleStopAll}
                      onDeleteStopped={() => actions.setShowDeleteConfirm(true)}
                      onExportJSON={exports.handleExportJSON}
                      onExportCSV={exports.handleExportCSV}
                      onExportMetrics={exports.handleExportMetrics}
                    />

                    <BatchActionNotice
                      previousWorkspace={actions.isPreviousWorkspaceAction}
                      progress={actions.batchProgress}
                      result={actions.batchResult}
                      isBusy={actions.isActionBusy}
                      onRetry={actions.retryFailed}
                      onDismiss={actions.dismissBatchResult}
                    />

                    {/* Bulk selection toolbar */}
                    <BulkActionsBar
                      visibleSessions={filters.paginatedSessions}
                      selectedIds={selectedIds}
                      isBusy={actions.isActionBusy}
                      onSelectAll={handleSelectAll}
                      onClearSelection={selection.clearSelection}
                      onBulkStart={actions.handleBulkStart}
                      onBulkStop={actions.handleBulkStop}
                    />

                    {/* Sessions list */}
                    <SessionList
                      isLoading={isLoading}
                      isActionBusy={actions.isActionBusy}
                      totalCount={sessions.length}
                      filteredSessions={filters.filteredSessions}
                      paginatedSessions={filters.paginatedSessions}
                      currentPage={filters.currentPage}
                      totalPages={filters.totalPages}
                      itemsPerPage={filters.itemsPerPage}
                      selectedIds={selectedIds}
                      onPageChange={filters.setCurrentPage}
                      onPageSizeChange={filters.handlePageSizeChange}
                      onCreate={handleCreateSession}
                      onClearFilters={filters.clearFilters}
                      onStart={handleRowStart}
                      onStop={handleRowStop}
                      onRowClick={handleRowClick}
                      onCopy={exports.handleCopySession}
                      onExportSummary={exports.handleExportRunSummary}
                      onRename={actions.handleRename}
                      onToggleSelect={selection.toggleSelect}
                    />
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-5 sidebar-sticky">
                  {hasSessionData && <FleetOverview sessions={sessions} />}
                  <McpServersOverview />
                  {sessions.length > 0 && <RecentActivityTimeline sessions={sessions} />}
                  <ShortcutsHint />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}
