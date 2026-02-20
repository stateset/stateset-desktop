import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { usePreferencesStore } from '../stores/preferences';
import { useUiStore } from '../stores/ui';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useToast } from '../components/ToastProvider';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useOptimisticSessionMutation } from '../hooks/useOptimisticSessionMutation';
import { usePageTitle } from '../hooks/usePageTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSessionsCache, useOnlineStatus } from '../hooks/useOfflineCache';
import { uiLogger } from '../lib/logger';
import { useAuditLogStore } from '../stores/auditLog';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { CreateAgentDialog } from '../components/CreateAgentDialog';
import { Pagination } from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import { DashboardStats, DashboardSessionRow } from '../features/dashboard';
import { RecentActivityTimeline } from '../features/dashboard/components/RecentActivityTimeline';
import {
  exportSessions,
  exportMetricsSummary,
  exportRunSummary,
  copyToClipboard,
} from '../lib/export';
import { requireTenantId, requireBrandId } from '../lib/auth-guards';
import type { AgentSession, AgentSessionConfig } from '../types';
import {
  Bot,
  Plus,
  Search,
  Filter,
  X,
  Command,
  RefreshCw,
  PlayCircle,
  StopCircle,
  FileJson,
  FileSpreadsheet,
  BarChart3,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TagFilter } from '../components/TagBadge';

type StatusFilter = 'all' | 'running' | 'stopped' | 'failed';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { tenant, currentBrand } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const [isCreating, setIsCreating] = useState(false);
  const [isStartingAll, setIsStartingAll] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [isDeletingStopped, setIsDeletingStopped] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { pageSize, refreshInterval } = usePreferencesStore();
  const { handleMutationError, handleQueryError, clearLastError } = useErrorHandler();

  // Online status for offline-first behavior
  const isOnline = useOnlineStatus();

  // Offline cache integration
  const { cacheFromQuery, getCachedSessions } = useSessionsCache(tenant?.id, currentBrand?.id);

  // Fetch sessions with offline cache fallback
  const {
    data: sessions = [],
    isLoading,
    error: sessionsError,
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
    refetchInterval: isOnline ? refreshInterval : false, // Don't refetch when offline
  });

  useEffect(() => {
    if (sessionsError) {
      handleQueryError('Failed to load sessions')(sessionsError);
    } else {
      clearLastError();
    }
  }, [sessionsError, handleQueryError, clearLastError]);

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

  // Extract all unique tags across sessions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const session of sessions) {
      if (session.tags) {
        for (const tag of session.tags) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [sessions]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Filter sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (
          statusFilter === 'running' &&
          session.status !== 'running' &&
          session.status !== 'paused'
        ) {
          return false;
        }
        if (statusFilter === 'stopped' && session.status !== 'stopped') {
          return false;
        }
        if (statusFilter === 'failed' && session.status !== 'failed') {
          return false;
        }
      }

      // Tag filter
      if (selectedTags.size > 0) {
        const sessionTags = session.tags || [];
        const hasMatchingTag = sessionTags.some((tag) => selectedTags.has(tag));
        if (!hasMatchingTag) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          session.agent_type.toLowerCase().includes(query) ||
          session.id.toLowerCase().includes(query) ||
          session.status.toLowerCase().includes(query) ||
          (session.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [sessions, searchQuery, statusFilter, selectedTags]);

  // Pagination
  const { totalPages, getPageItems, itemsPerPage } = usePagination(filteredSessions, pageSize);
  const paginatedSessions = useMemo(() => getPageItems(currentPage), [getPageItems, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Clamp current page when the total page count shrinks.
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Create session mutation
  type CreateAgentRequest = {
    agentType: string;
    config: Partial<AgentSessionConfig>;
  };

  const createSession = useMutation({
    mutationFn: ({ agentType, config }: CreateAgentRequest) =>
      agentApi.createSession(
        requireTenantId(tenant),
        requireBrandId(currentBrand),
        agentType,
        config
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

  // Start session mutation with optimistic update
  const startSession = useOptimisticSessionMutation({
    optimisticStatus: 'starting',
    mutationFn: agentApi.startSession,
    onError: handleMutationError('Failed to start session'),
  });

  // Stop session mutation with optimistic update
  const stopSession = useOptimisticSessionMutation({
    optimisticStatus: 'stopping',
    mutationFn: agentApi.stopSession,
    onError: handleMutationError('Failed to stop session'),
  });

  // Delete session mutation
  const deleteSession = useMutation({
    mutationFn: (sessionId: string) =>
      agentApi.deleteSession(requireTenantId(tenant), requireBrandId(currentBrand), sessionId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
    onError: handleMutationError('Failed to delete session'),
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

  const handleCreateAgent = async (agentType: string, config: Partial<AgentSessionConfig>) => {
    setIsCreating(true);
    try {
      await createSession.mutateAsync({ agentType, config });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartAll = async () => {
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'failed');
    if (stoppedSessions.length === 0) return;

    setIsStartingAll(true);
    try {
      for (const session of stoppedSessions) {
        await startSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.started', `Started agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
      }
      showToast({
        variant: 'success',
        title: 'All Agents Started',
        message: `Started ${stoppedSessions.length} agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsStartingAll(false);
    }
  };

  const handleStopAll = async () => {
    const runningSessions = sessions.filter((s) => s.status === 'running' || s.status === 'paused');
    if (runningSessions.length === 0) return;

    setIsStoppingAll(true);
    try {
      for (const session of runningSessions) {
        await stopSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.stopped', `Stopped agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
      }
      showToast({
        variant: 'success',
        title: 'All Agents Stopped',
        message: `Stopped ${runningSessions.length} agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsStoppingAll(false);
    }
  };

  const handleDeleteStopped = async () => {
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'failed');
    if (stoppedSessions.length === 0) return;

    setIsDeletingStopped(true);
    try {
      let deletedCount = 0;
      for (const session of stoppedSessions) {
        await deleteSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.deleted', `Deleted agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
        deletedCount++;
      }
      showToast({
        variant: 'success',
        title: 'Agents Deleted',
        message: `Deleted ${deletedCount} stopped agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsDeletingStopped(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleExportJSON = () => {
    exportSessions(sessions, { format: 'json' });
    showToast({
      variant: 'success',
      title: 'Exported as JSON',
      message: 'Agent data has been downloaded',
    });
  };

  const handleExportCSV = () => {
    exportSessions(sessions, { format: 'csv' });
    showToast({
      variant: 'success',
      title: 'Exported as CSV',
      message: 'Agent data has been downloaded',
    });
  };

  const handleExportMetrics = () => {
    exportMetricsSummary(sessions);
    showToast({
      variant: 'success',
      title: 'Metrics Exported',
      message: 'Metrics summary has been downloaded',
    });
  };

  const handleCopySession = async (session: AgentSession) => {
    const success = await copyToClipboard({
      id: session.id,
      agent_type: session.agent_type,
      status: session.status,
      metrics: session.metrics,
    });
    showToast({
      variant: success ? 'success' : 'error',
      title: success ? 'Copied to Clipboard' : 'Copy Failed',
      message: success ? 'Session data copied' : 'Failed to copy to clipboard',
    });
  };

  const handleExportRunSummary = (session: AgentSession) => {
    exportRunSummary(session);
    showToast({
      variant: 'success',
      title: 'Summary Exported',
      message: 'Run summary has been downloaded',
    });
  };

  // Stats
  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused'
  ).length;
  const stoppedCount = sessions.filter(
    (s) => s.status === 'stopped' || s.status === 'failed'
  ).length;

  const hasActiveFilters = searchQuery || statusFilter !== 'all';

  return (
    <div className="p-6">
      {/* Create Agent Dialog */}
      <CreateAgentDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreateAgent={handleCreateAgent}
        isCreating={isCreating}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteStopped}
        title="Delete Stopped Agents"
        message={`This will permanently delete ${stoppedCount} stopped/failed agent session(s). This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        isLoading={isDeletingStopped}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agent Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage your autonomous AI agents</p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800/90 hover:bg-gray-700 rounded-lg text-sm text-gray-400 border border-gray-800/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            title="Command palette (Ctrl/Cmd+K)"
            aria-label="Open command palette"
          >
            <Command className="w-4 h-4" aria-hidden="true" />
            <kbd className="text-xs">Ctrl/Cmd+K</kbd>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-800/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            title="Refresh (Ctrl/Cmd+R)"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleCreateSession}
            disabled={!currentBrand || isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg font-medium border border-brand-500/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
            title="New Agent (Ctrl/Cmd+N)"
            aria-label="Create new agent"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-5 h-5" aria-hidden="true" />
                <span>New Agent</span>
              </>
            )}
          </button>
        </div>
      </div>

      <DashboardStats sessions={sessions} />

      {sessions.length > 0 && <RecentActivityTimeline sessions={sessions} />}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search agents... (press / to focus)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search agents"
            className="w-full pl-10 pr-10 py-2 bg-gray-800/80 border border-gray-700 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-500" aria-hidden="true" />
          {(['all', 'running', 'stopped', 'failed'] as StatusFilter[]).map((filter) => (
            <button
              type="button"
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-lg border border-gray-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700'
              )}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Tags:</span>
          <TagFilter allTags={allTags} selectedTags={selectedTags} onToggleTag={toggleTag} />
          {selectedTags.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags(new Set())}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
              aria-label="Clear selected tags"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          onClick={handleStartAll}
          disabled={stoppedCount === 0 || isStartingAll}
          className="flex items-center gap-2 px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-green-800/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
        >
          {isStartingAll ? (
            <div className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          ) : (
            <PlayCircle className="w-4 h-4" aria-hidden="true" />
          )}
          Start All ({stoppedCount})
        </button>

        <button
          type="button"
          onClick={handleStopAll}
          disabled={runningCount === 0 || isStoppingAll}
          className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-red-800/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
        >
          {isStoppingAll ? (
            <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
          ) : (
            <StopCircle className="w-4 h-4" aria-hidden="true" />
          )}
          Stop All ({runningCount})
        </button>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={stoppedCount === 0 || isDeletingStopped}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
        >
          {isDeletingStopped ? (
            <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          )}
          Delete Stopped ({stoppedCount})
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={sessions.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
            title="Export as JSON"
          >
            <FileJson className="w-4 h-4" aria-hidden="true" />
            JSON
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={sessions.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
            title="Export as CSV"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportMetrics}
            disabled={sessions.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-800/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
            title="Export metrics summary"
          >
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
            Metrics
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-gray-900 border border-gray-800/90 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold">Agent Sessions</h2>
          <span className="text-sm text-gray-400">
            {hasActiveFilters
              ? `${filteredSessions.length} of ${sessions.length}`
              : `${sessions.length} total`}
          </span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No agent sessions yet"
            description="Create your first agent to get started with autonomous customer service."
            action={{
              label: 'Create Agent',
              onClick: handleCreateSession,
            }}
          />
        ) : filteredSessions.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching agents"
            description="Try adjusting your search or filter criteria."
            action={{
              label: 'Clear Filters',
              onClick: () => {
                setSearchQuery('');
                setStatusFilter('all');
              },
            }}
          />
        ) : (
          <>
            <div className="divide-y divide-gray-800">
              {paginatedSessions.map((session) => (
                <DashboardSessionRow
                  key={session.id}
                  session={session}
                  onStart={() => startSession.mutate(session.id)}
                  onStop={() => stopSession.mutate(session.id)}
                  onClick={() => navigate(`/agent/${session.id}`)}
                  onCopy={() => handleCopySession(session)}
                  onExportSummary={() => handleExportRunSummary(session)}
                />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredSessions.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-4 text-xs text-gray-600 flex flex-wrap items-center gap-4">
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Ctrl/Cmd+K</kbd> Command palette
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">/</kbd> Search
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Ctrl/Cmd+N</kbd> New agent
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Ctrl/Cmd+R</kbd> Refresh
        </span>
      </div>
    </div>
  );
}
