import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { useDebounce } from '../hooks/useDebounce';
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
  X,
  Command,
  RefreshCw,
  PlayCircle,
  StopCircle,
  FileJson,
  FileSpreadsheet,
  BarChart3,
  Trash2,
  Download,
  ChevronDown,
  WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TagFilter } from '../components/TagBadge';
import { Spinner } from '../components/Spinner';

type StatusFilter = 'all' | 'running' | 'stopped' | 'failed';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good evening';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) return `${hours}h ${mins}m`;
  const days = Math.floor(seconds / 86400);
  return `${days}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

import {
  pageContainerVariants,
  pageSectionVariants,
  listContainerVariants,
  listItemVariants,
} from '../lib/animations';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const reduceMotion = useReducedMotion();
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
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
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const pageSize = usePreferencesStore((s) => s.pageSize);
  const setPageSize = usePreferencesStore((s) => s.setPageSize);
  const refreshInterval = usePreferencesStore((s) => s.refreshInterval);
  const { handleMutationError, handleQueryError, clearLastError } = useErrorHandler();

  // Online status for offline-first behavior
  const isOnline = useOnlineStatus();

  // Offline cache integration
  const { cacheFromQuery, getCachedSessions } = useSessionsCache(tenant?.id, currentBrand?.id);

  // Fetch sessions with offline cache fallback
  const {
    data: sessions = [],
    isLoading,
    isFetching,
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
    refetchInterval: isOnline ? refreshInterval : false,
  });

  useEffect(() => {
    if (sessionsError) {
      handleQueryError('Failed to load sessions', 'dashboard:sessions')(sessionsError);
      return;
    }

    if (!isFetching) {
      clearLastError();
    }
  }, [sessionsError, isFetching, handleQueryError, clearLastError]);

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

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
        setShowExportMenu(false);
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

  // Filter sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
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

      if (selectedTags.size > 0) {
        const sessionTags = session.tags || [];
        const hasMatchingTag = sessionTags.some((tag) => selectedTags.has(tag));
        if (!hasMatchingTag) return false;
      }

      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        return (
          session.agent_type.toLowerCase().includes(query) ||
          session.id.toLowerCase().includes(query) ||
          session.status.toLowerCase().includes(query) ||
          (session.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [sessions, debouncedSearch, statusFilter, selectedTags]);

  // Pagination
  const { totalPages, getPageItems, itemsPerPage } = usePagination(filteredSessions, pageSize);
  const paginatedSessions = useMemo(() => getPageItems(currentPage), [getPageItems, currentPage]);

  // Reset to page 1 and clear selection when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, statusFilter, pageSize]);

  // Clamp current page when the total page count shrinks
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
    setShowExportMenu(false);
    showToast({
      variant: 'success',
      title: 'Exported as JSON',
      message: 'Agent data has been downloaded',
    });
  };

  const handleExportCSV = () => {
    exportSessions(sessions, { format: 'csv' });
    setShowExportMenu(false);
    showToast({
      variant: 'success',
      title: 'Exported as CSV',
      message: 'Agent data has been downloaded',
    });
  };

  const handleExportMetrics = () => {
    exportMetricsSummary(sessions);
    setShowExportMenu(false);
    showToast({
      variant: 'success',
      title: 'Metrics Exported',
      message: 'Metrics summary has been downloaded',
    });
  };

  const handleCopySession = useCallback(
    async (session: AgentSession) => {
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
    },
    [showToast]
  );

  const handleExportRunSummary = useCallback(
    (session: AgentSession) => {
      exportRunSummary(session);
      showToast({
        variant: 'success',
        title: 'Summary Exported',
        message: 'Run summary has been downloaded',
      });
    },
    [showToast]
  );

  // Stable callbacks for DashboardSessionRow (avoids defeating memo)
  const handleRowStart = useCallback((id: string) => startSession.mutate(id), [startSession]);
  const handleRowStop = useCallback((id: string) => stopSession.mutate(id), [stopSession]);
  const handleRowClick = useCallback((id: string) => navigate(`/agent/${id}`), [navigate]);
  const handleRowCopy = useCallback(
    (session: AgentSession) => handleCopySession(session),
    [handleCopySession]
  );
  const handleRowExportSummary = useCallback(
    (session: AgentSession) => handleExportRunSummary(session),
    [handleExportRunSummary]
  );
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedSessions.map((s) => s.id)));
    }
  }, [paginatedSessions, selectedIds.size]);

  const handleBulkStart = useCallback(async () => {
    const toStart = sessions.filter(
      (s) => selectedIds.has(s.id) && (s.status === 'stopped' || s.status === 'failed')
    );
    for (const s of toStart) {
      try {
        await agentApi.startSession(requireTenantId(tenant), requireBrandId(currentBrand), s.id);
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    setSelectedIds(new Set());
    showToast({
      variant: 'success',
      title: 'Started',
      message: `${toStart.length} agent(s) started.`,
    });
  }, [selectedIds, sessions, tenant, currentBrand, queryClient, showToast]);

  const handleBulkStop = useCallback(async () => {
    const toStop = sessions.filter(
      (s) => selectedIds.has(s.id) && (s.status === 'running' || s.status === 'paused')
    );
    for (const s of toStop) {
      try {
        await agentApi.stopSession(requireTenantId(tenant), requireBrandId(currentBrand), s.id);
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    setSelectedIds(new Set());
    showToast({
      variant: 'success',
      title: 'Stopped',
      message: `${toStop.length} agent(s) stopped.`,
    });
  }, [selectedIds, sessions, tenant, currentBrand, queryClient, showToast]);

  const handleRowRename = useCallback(
    async (id: string, name: string) => {
      try {
        await agentApi.renameSession(
          requireTenantId(tenant),
          requireBrandId(currentBrand),
          id,
          name
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
        showToast({
          variant: 'success',
          title: 'Renamed',
          message: `Session renamed to "${name}".`,
        });
      } catch (error) {
        showToast({
          variant: 'error',
          title: 'Failed to rename',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [tenant, currentBrand, queryClient, showToast]
  );

  // Stats
  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused'
  ).length;
  const stoppedCount = sessions.filter(
    (s) => s.status === 'stopped' || s.status === 'failed'
  ).length;
  const failedCount = sessions.filter((s) => s.status === 'failed').length;

  // Fleet insights for sidebar
  const totalUptime = sessions.reduce((acc, s) => acc + s.metrics.uptime_seconds, 0);
  const totalCost = sessions.reduce((acc, s) => acc + (s.metrics.estimated_cost_cents || 0), 0);
  const avgTokensPerAgent =
    sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0) / sessions.length)
      : 0;
  const totalErrors = sessions.reduce((acc, s) => acc + s.metrics.errors, 0);

  // Greeting
  const greeting = useMemo(() => getGreeting(), []);

  // Stat card click handler: toggle filter
  const handleStatClick = useCallback((filter: string) => {
    setStatusFilter((prev) => (prev === filter ? 'all' : (filter as StatusFilter)));
  }, []);

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || selectedTags.size > 0;

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
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteStopped}
        title="Delete Stopped Agents"
        message={`This will permanently delete ${stoppedCount} stopped/failed agent session(s). This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        isLoading={isDeletingStopped}
      />

      <motion.div
        variants={reduceMotion ? undefined : pageContainerVariants}
        initial={reduceMotion ? undefined : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
      >
        {/* Header */}
        <motion.div
          variants={reduceMotion ? undefined : pageSectionVariants}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 mt-2"
        >
          <div>
            <h1 className="page-title">{greeting}</h1>
            <p className="page-subtitle flex items-center gap-2 mt-1">
              {sessions.length > 0 && !isLoading ? (
                <span className="flex items-center gap-2">
                  {runningCount > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                  {runningCount > 0
                    ? `${runningCount} agent${runningCount !== 1 ? 's' : ''} running`
                    : 'No agents running'}
                  {sessions.length > runningCount && <span className="text-gray-600">·</span>}
                  {sessions.length > runningCount && (
                    <span>{sessions.length - runningCount} idle</span>
                  )}
                </span>
              ) : (
                <span>Manage your autonomous AI agents</span>
              )}
              {!isOnline && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <WifiOff className="w-3 h-3" aria-hidden="true" />
                  Offline
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/40 hover:bg-slate-800/60 rounded-xl text-sm font-medium text-gray-400 border border-slate-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 shadow-sm"
              title="Command palette (Ctrl/Cmd+K)"
              aria-label="Open command palette"
            >
              <Command className="w-3.5 h-3.5" aria-hidden="true" />
              <kbd className="text-[10px] font-bold tracking-widest uppercase">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 bg-slate-800/40 hover:bg-slate-800/60 rounded-xl border border-slate-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 shadow-sm"
              title="Refresh (Ctrl/Cmd+R)"
              aria-label="Refresh sessions"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleCreateSession}
              disabled={!currentBrand || isCreating}
              className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-gray-400 rounded-xl font-bold text-sm border border-white/10 transition-all shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="New Agent (Ctrl/Cmd+N)"
              aria-label="Create new agent"
            >
              {isCreating ? (
                <Spinner size="md" />
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>New Agent</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={reduceMotion ? undefined : pageSectionVariants}>
          <DashboardStats
            sessions={sessions}
            isLoading={isLoading}
            activeFilter={statusFilter !== 'all' ? statusFilter : null}
            onStatClick={handleStatClick}
          />
        </motion.div>

        {/* Main content: 2-column grid */}
        <motion.div variants={reduceMotion ? undefined : pageSectionVariants}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sessions panel - 2 columns */}
            <div className="lg:col-span-2">
              <div className="relative bg-slate-900/40 border border-slate-700/40 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
                {/* Top highlight */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                {/* Card header with integrated toolbar */}
                <div className="px-5 py-4 border-b border-slate-700/40 bg-slate-900/50 space-y-3">
                  {/* Title row */}
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg text-gray-200 tracking-tight">
                      Agent Sessions
                    </h2>
                    <span className="text-xs font-semibold text-gray-500">
                      {hasActiveFilters
                        ? `${filteredSessions.length} of ${sessions.length}`
                        : `${sessions.length} total`}
                    </span>
                  </div>

                  {/* Search + Filter row */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                        aria-hidden="true"
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search agents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search agents"
                        className="w-full pl-9 pr-8 py-2 bg-slate-800/50 border border-slate-700/40 rounded-xl text-sm font-medium placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-inner transition-all text-gray-200"
                      />
                      <AnimatePresence>
                        {searchQuery && (
                          <motion.button
                            key="clear-search"
                            type="button"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-700/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors"
                            aria-label="Clear search"
                          >
                            <X
                              className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300"
                              aria-hidden="true"
                            />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center gap-0.5 bg-slate-800/40 p-0.5 rounded-xl border border-slate-700/40">
                      {(['all', 'running', 'stopped', 'failed'] as StatusFilter[]).map((filter) => (
                        <button
                          type="button"
                          key={filter}
                          onClick={() => setStatusFilter(filter)}
                          className={clsx(
                            'px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                            statusFilter === filter
                              ? 'bg-slate-700/80 text-white shadow-sm'
                              : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/60'
                          )}
                        >
                          {filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tag filter */}
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        Tags
                      </span>
                      <TagFilter
                        allTags={allTags}
                        selectedTags={selectedTags}
                        onToggleTag={toggleTag}
                      />
                      {selectedTags.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedTags(new Set())}
                          className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-200 bg-slate-800/40 hover:bg-slate-800/60 px-2 py-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-md"
                          aria-label="Clear selected tags"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  {/* Quick actions row */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleStartAll}
                      disabled={stoppedCount === 0 || isStartingAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-emerald-500/20 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      {isStartingAll ? (
                        <Spinner size="md" color="border-t-emerald-400" />
                      ) : (
                        <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Start All
                      {stoppedCount > 0 && (
                        <span className="text-emerald-500/70 text-[10px]">{stoppedCount}</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleStopAll}
                      disabled={runningCount === 0 || isStoppingAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-rose-500/20 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                    >
                      {isStoppingAll ? (
                        <Spinner size="md" color="border-t-rose-400" />
                      ) : (
                        <StopCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Stop All
                      {runningCount > 0 && (
                        <span className="text-rose-500/70 text-[10px]">{runningCount}</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={stoppedCount === 0 || isDeletingStopped}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-800/60 text-gray-400 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-slate-700/40 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                    >
                      {isDeletingStopped ? (
                        <Spinner size="md" color="border-t-gray-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Clean Up
                    </button>

                    {/* Export dropdown */}
                    <div className="relative ml-auto" ref={exportMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={sessions.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-slate-700/40 text-xs font-bold text-gray-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        Export
                        <ChevronDown
                          className={clsx(
                            'w-3 h-3 transition-transform',
                            showExportMenu && 'rotate-180'
                          )}
                          aria-hidden="true"
                        />
                      </button>
                      <AnimatePresence>
                        {showExportMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700/60 rounded-xl shadow-xl overflow-hidden z-20"
                          >
                            <button
                              type="button"
                              onClick={handleExportJSON}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-gray-300 hover:bg-slate-700/60 hover:text-white transition-colors text-left"
                            >
                              <FileJson className="w-4 h-4 text-gray-500" aria-hidden="true" />
                              JSON
                            </button>
                            <button
                              type="button"
                              onClick={handleExportCSV}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-gray-300 hover:bg-slate-700/60 hover:text-white transition-colors text-left"
                            >
                              <FileSpreadsheet
                                className="w-4 h-4 text-gray-500"
                                aria-hidden="true"
                              />
                              CSV
                            </button>
                            <div className="border-t border-slate-700/50" />
                            <button
                              type="button"
                              onClick={handleExportMetrics}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-gray-300 hover:bg-slate-700/60 hover:text-white transition-colors text-left"
                            >
                              <BarChart3 className="w-4 h-4 text-gray-500" aria-hidden="true" />
                              Metrics Summary
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Bulk selection toolbar */}
                {selectedIds.size > 0 && (
                  <div className="px-5 py-2.5 border-b border-slate-700/40 bg-brand-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === paginatedSessions.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500/40 cursor-pointer"
                        aria-label="Select all visible agents"
                      />
                      <span className="text-sm font-medium text-brand-300">
                        {selectedIds.size} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBulkStart}
                        disabled={
                          !sessions.some(
                            (s) =>
                              selectedIds.has(s.id) &&
                              (s.status === 'stopped' || s.status === 'failed')
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-emerald-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                      >
                        <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Start Selected
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkStop}
                        disabled={
                          !sessions.some(
                            (s) =>
                              selectedIds.has(s.id) &&
                              (s.status === 'running' || s.status === 'paused')
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-rose-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                      >
                        <StopCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Stop Selected
                      </button>
                    </div>
                  </div>
                )}

                {/* Sessions list */}
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <EmptyState
                    icon={Bot}
                    title="Launch your first agent"
                    description="Agents autonomously handle customer service, process orders, and manage workflows. Create one to get started."
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
                        setSelectedTags(new Set());
                      },
                    }}
                  />
                ) : (
                  <>
                    <motion.div
                      className="divide-y divide-slate-800/80"
                      variants={listContainerVariants}
                      initial={reduceMotion ? 'visible' : 'hidden'}
                      animate="visible"
                      key={currentPage}
                    >
                      {paginatedSessions.map((session) => (
                        <motion.div key={session.id} variants={listItemVariants}>
                          <DashboardSessionRow
                            session={session}
                            onStart={handleRowStart}
                            onStop={handleRowStop}
                            onClick={handleRowClick}
                            onCopy={handleRowCopy}
                            onExportSummary={handleRowExportSummary}
                            onRename={handleRowRename}
                            isSelected={selectedIds.has(session.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={filteredSessions.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => setPageSize(size as 10 | 25 | 50 | 100)}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-5 sidebar-sticky">
              {/* Fleet Overview */}
              <div className="relative bg-slate-900/40 border border-slate-700/40 rounded-2xl overflow-hidden backdrop-blur-md">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/50">
                  <h3 className="text-sm font-bold text-gray-300 tracking-tight">Fleet Overview</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between group">
                    <span className="flex items-center gap-2.5 text-sm text-gray-400">
                      <span className="relative flex h-2 w-2">
                        {runningCount > 0 && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Running
                    </span>
                    <span className="text-sm font-bold text-gray-200 tabular-nums">
                      {runningCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2.5 text-sm text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      Stopped
                    </span>
                    <span className="text-sm font-bold text-gray-200 tabular-nums">
                      {stoppedCount - failedCount}
                    </span>
                  </div>
                  {failedCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2.5 text-sm text-rose-400">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        Failed
                      </span>
                      <span className="text-sm font-bold text-rose-300 tabular-nums">
                        {failedCount}
                      </span>
                    </div>
                  )}

                  {/* Fleet health bar */}
                  {sessions.length > 0 && (
                    <div className="pt-2">
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                        {runningCount > 0 && (
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{
                              width: `${(runningCount / sessions.length) * 100}%`,
                            }}
                          />
                        )}
                        {stoppedCount - failedCount > 0 && (
                          <div
                            className="h-full bg-slate-500 transition-all duration-500"
                            style={{
                              width: `${((stoppedCount - failedCount) / sessions.length) * 100}%`,
                            }}
                          />
                        )}
                        {failedCount > 0 && (
                          <div
                            className="h-full bg-rose-500 transition-all duration-500"
                            style={{
                              width: `${(failedCount / sessions.length) * 100}%`,
                            }}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-1.5 font-medium">
                        {sessions.length} agent{sessions.length !== 1 ? 's' : ''} total
                      </p>
                    </div>
                  )}

                  {/* Fleet insights */}
                  {sessions.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-slate-700/40 space-y-2">
                      {totalUptime > 0 && (
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-gray-500">Total Uptime</span>
                          <span className="font-semibold text-gray-300 tabular-nums">
                            {formatUptime(totalUptime)}
                          </span>
                        </div>
                      )}
                      {totalCost > 0 && (
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-gray-500">Est. Cost</span>
                          <span className="font-semibold text-gray-300 tabular-nums">
                            ${(totalCost / 100).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-gray-500">Avg Tokens / Agent</span>
                        <span className="font-semibold text-gray-300 tabular-nums">
                          {avgTokensPerAgent >= 1_000
                            ? `${(avgTokensPerAgent / 1_000).toFixed(1)}K`
                            : avgTokensPerAgent.toLocaleString()}
                        </span>
                      </div>
                      {totalErrors > 0 && (
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-gray-500">Total Errors</span>
                          <span className="font-semibold text-amber-400 tabular-nums">
                            {totalErrors}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Timeline */}
              {sessions.length > 0 && <RecentActivityTimeline sessions={sessions} />}

              {/* Keyboard shortcuts */}
              <div className="px-1 space-y-1.5">
                {[
                  { key: '⌘K', label: 'Command palette' },
                  { key: '/', label: 'Search' },
                  { key: '⌘N', label: 'New agent' },
                  { key: '⌘R', label: 'Refresh' },
                ].map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center gap-2 text-gray-600">
                    <kbd className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 bg-slate-800/60 text-gray-500 border border-slate-700/40 rounded text-[10px] font-bold">
                      {shortcut.key}
                    </kbd>
                    <span className="text-[11px] font-medium">{shortcut.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
