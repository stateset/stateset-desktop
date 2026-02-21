import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { useDebounce } from '../hooks/useDebounce';
import { agentApi } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { exportRunSummary } from '../lib/export';
import { normalizeAgentConfig } from '../lib/agentConfig';
import { queryKeys } from '../lib/queryKeys';
import { useToast } from '../components/ToastProvider';
import { useAgentStream } from '../hooks/useAgentStream';
import { useAgentSession } from '../hooks/useAgentSession';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { EmptyState } from '../components/EmptyState';
import {
  MessageItem,
  MetricsPanel,
  ConfigModal,
  TypingIndicator,
  AgentToolbar,
  MessageInput,
  useLogCache,
  downloadConversation,
  AUTO_SCROLL_THRESHOLD_PX,
  MANUAL_LOOP_INTERVAL_THRESHOLD_MS,
  MANUAL_LOOP_INTERVAL_CLAMP_MS,
} from '../features/agent-console';
import { requireTenantId, requireBrandId, requireSessionId } from '../lib/auth-guards';
import { SaveAsTemplateDialog } from '../features/templates';
import type { AgentSessionConfig } from '../types';
import { PlayCircle, Loader2, AlertCircle, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePageTitle } from '../hooks/usePageTitle';

export default function AgentConsole() {
  usePageTitle('Agent Console');
  const { sessionId } = useParams<{ sessionId: string }>();
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { playMessage, playError } = useNotificationSound();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const manualAwaitingResponseRef = useRef(false);
  const manualPauseInFlightRef = useRef(false);
  const loopIntervalClampedRef = useRef(false);

  const [input, setInput] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<AgentSessionConfig | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [isCloning, setIsCloning] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // ── Hooks ─────────────────────────────────────────────────────────

  const { logs, setLogs, hasCachedLogs, setHasCachedLogs, addLogEntry, readLogCache } = useLogCache(
    { sessionId }
  );

  const handleError = useCallback(
    (title: string, message: string) => {
      showToast({ variant: 'error', title, message });
    },
    [showToast]
  );

  const handleSuccess = useCallback(
    (title: string, message: string) => {
      showToast({ variant: 'success', title, message });
    },
    [showToast]
  );

  const {
    session,
    isLoading: sessionLoading,
    startSessionAsync,
    pauseSession: pauseSessionMutate,
    resumeSessionAsync,
    stopSession: stopSessionMutate,
    sendMessage: sendMessageMutate,
    sendMessageAsync,
    cloneAgentAsync,
    isStarting,
    isPausing,
    isStopping,
  } = useAgentSession({
    sessionId: requireSessionId(sessionId),
    onError: handleError,
    onSuccess: handleSuccess,
  });

  const isManualMode =
    (session?.config?.loop_interval_ms ?? MANUAL_LOOP_INTERVAL_THRESHOLD_MS + 1) <=
    MANUAL_LOOP_INTERVAL_THRESHOLD_MS;

  // ── SSE Streaming ─────────────────────────────────────────────────

  const {
    isConnected,
    isConnecting,
    error: streamError,
    messages,
    status: streamStatus,
    metrics: streamMetrics,
    isTyping,
    connect,
    disconnect,
  } = useAgentStream({
    tenantId: tenant?.id || '',
    brandId: currentBrand?.id || '',
    sessionId: sessionId || '',
    autoReconnect: true,
    onEvent: (event) => {
      if (event.type === 'message' && 'role' in event && event.role === 'assistant') {
        playMessage();
        addLogEntry('info', 'Assistant message received', 'stream');
        if (isManualMode && manualAwaitingResponseRef.current) {
          manualAwaitingResponseRef.current = false;
          manualPauseInFlightRef.current = true;
          pauseSessionMutate();
        }
      } else if (event.type === 'error') {
        playError();
        addLogEntry('error', `${event.code}: ${event.message}`, 'stream');
        manualAwaitingResponseRef.current = false;
        manualPauseInFlightRef.current = false;
      } else if (event.type === 'log') {
        const source =
          event.metadata && typeof event.metadata.source === 'string'
            ? event.metadata.source
            : event.metadata && typeof event.metadata.component === 'string'
              ? event.metadata.component
              : 'agent';
        addLogEntry(event.level, event.message, source, event.metadata);
      } else if (event.type === 'tool_call') {
        addLogEntry('debug', `Tool call: ${event.tool_name}`, 'stream', { event });
      } else if (event.type === 'tool_result') {
        addLogEntry('debug', 'Tool result received', 'stream');
      }
    },
    onError: (message) => {
      showToast({ variant: 'error', title: 'Stream error', message });
      addLogEntry('error', message, 'connection');
    },
  });

  // ── Connect/disconnect on session status ──────────────────────────

  useEffect(() => {
    if (session?.status === 'running' || session?.status === 'paused') {
      connect();
    }
    return () => disconnect();
  }, [session?.status, connect, disconnect]);

  // ── Computed state ────────────────────────────────────────────────

  const currentStatus = streamStatus || session?.status;
  const currentMetrics = useMemo(
    () =>
      session?.metrics
        ? {
            ...session.metrics,
            ...streamMetrics,
            errors: session.metrics.errors,
            messages_sent: session.metrics.messages_sent,
          }
        : streamMetrics,
    [session?.metrics, streamMetrics]
  );

  const isRunning = currentStatus === 'running';
  const isPaused = currentStatus === 'paused';
  const isStopped = currentStatus === 'stopped' || currentStatus === 'failed';
  const canSend = isRunning || isPaused || isManualMode;
  const showIdleState = !isRunning && !isPaused;
  const showStreamDisconnected = (isRunning || isPaused) && !isConnected && !isConnecting;
  const showStartStreamCta = showIdleState || isPaused || showStreamDisconnected;

  const filteredMessages = useMemo(() => {
    if (!debouncedSearch) return messages;
    const query = debouncedSearch.toLowerCase();
    const safeStringify = (value: unknown): string => {
      try {
        return JSON.stringify(value)?.toLowerCase() ?? '';
      } catch {
        return '';
      }
    };
    return messages.filter((msg) => {
      switch (msg.type) {
        case 'message':
        case 'thinking':
          return msg.content.toLowerCase().includes(query);
        case 'tool_call':
          return (
            msg.tool_name.toLowerCase().includes(query) ||
            safeStringify(msg.arguments).includes(query)
          );
        case 'tool_result':
          return safeStringify(msg.result).includes(query);
        case 'log':
          return (
            msg.message.toLowerCase().includes(query) || safeStringify(msg.metadata).includes(query)
          );
        case 'error':
          return `${msg.code} ${msg.message}`.toLowerCase().includes(query);
        case 'status_changed':
          return (
            msg.status.toLowerCase().includes(query) ||
            (msg.message ? msg.message.toLowerCase().includes(query) : false)
          );
        default:
          return false;
      }
    });
  }, [messages, debouncedSearch]);

  const showEmptyState = showIdleState && filteredMessages.length === 0;

  const startStreamLabel = showStreamDisconnected
    ? 'Reconnect Stream'
    : isPaused
      ? 'Resume & Stream'
      : isManualMode
        ? 'Connect & Stream'
        : 'Start & Stream';

  const isStartStreamPending = isStarting || isConnecting;
  const streamCtaMessage = showStreamDisconnected
    ? 'Live stream disconnected. Reconnect to resume updates.'
    : isPaused
      ? 'Session paused. Resume to continue the run.'
      : isManualMode
        ? 'Manual mode: connect and send a message to start the agent.'
        : 'Session is idle. Start & Stream to run this agent.';
  const showStreamBanner = showStartStreamCta && !showEmptyState;

  // ── Auto-scroll ───────────────────────────────────────────────────

  useEffect(() => {
    if (!autoScroll) return;
    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, autoScroll]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setAutoScroll(distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX);
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Config ────────────────────────────────────────────────────────

  useEffect(() => {
    if (session?.config && !showConfig) {
      setConfigDraft(normalizeAgentConfig(session.config));
    }
  }, [session?.config, showConfig]);

  const updateConfig = useMutation({
    mutationFn: (config: AgentSessionConfig) =>
      agentApi.updateConfig(
        requireTenantId(tenant),
        requireBrandId(currentBrand),
        requireSessionId(sessionId),
        config
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(requireSessionId(sessionId)),
      });
      showToast({
        variant: 'success',
        title: 'Config updated',
        message: 'Agent settings have been saved.',
      });
      setShowConfig(false);
    },
    onError: (error: unknown) => {
      showToast({
        variant: 'error',
        title: 'Failed to update config',
        message: getErrorMessage(error),
      });
    },
  });

  useEffect(() => {
    if (!session?.config) return;
    if (loopIntervalClampedRef.current) return;
    if (session.config.loop_interval_ms >= 100) return;
    loopIntervalClampedRef.current = true;
    updateConfig.mutate(
      normalizeAgentConfig({ loop_interval_ms: MANUAL_LOOP_INTERVAL_CLAMP_MS }, session.config)
    );
    showToast({
      variant: 'info',
      title: 'Loop interval updated',
      message: 'Loop interval was too low and has been set to 1000ms.',
    });
  }, [session?.config, updateConfig, showToast]);

  // ── Manual mode auto-pause ────────────────────────────────────────

  useEffect(() => {
    if (!isManualMode) return;
    if (isRunning && !manualAwaitingResponseRef.current && !manualPauseInFlightRef.current) {
      manualPauseInFlightRef.current = true;
      pauseSessionMutate();
      return;
    }
    if (isPaused || isStopped) {
      manualPauseInFlightRef.current = false;
    }
  }, [isManualMode, isRunning, isPaused, isStopped, pauseSessionMutate]);

  // ── Action handlers ───────────────────────────────────────────────

  const handleStartAndStream = async () => {
    if (isManualMode) {
      connect();
      showToast({
        variant: 'info',
        title: 'Manual mode',
        message: 'Send a message to start the agent.',
      });
      return;
    }
    const status = streamStatus || session?.status;
    try {
      if (status === 'stopped' || status === 'failed') await startSessionAsync();
      else if (status === 'paused') await resumeSessionAsync();
      connect();
    } catch {
      // Errors handled by mutation callbacks.
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const message = input;
    setInput('');

    if (isManualMode) {
      manualAwaitingResponseRef.current = true;
      try {
        if (
          session?.config &&
          session.config.loop_interval_ms !== undefined &&
          session.config.loop_interval_ms < 100
        ) {
          try {
            await agentApi.updateConfig(
              requireTenantId(tenant),
              requireBrandId(currentBrand),
              requireSessionId(sessionId),
              normalizeAgentConfig(
                { loop_interval_ms: MANUAL_LOOP_INTERVAL_CLAMP_MS },
                session.config
              )
            );
            queryClient.invalidateQueries({
              queryKey: queryKeys.sessions.detail(requireSessionId(sessionId)),
            });
          } catch (error) {
            showToast({
              variant: 'error',
              title: 'Failed to update config',
              message: getErrorMessage(error),
            });
          }
        }
        if (isStopped) await startSessionAsync();
        else if (isPaused) await resumeSessionAsync();
        await sendMessageAsync(message);
      } catch {
        manualAwaitingResponseRef.current = false;
      }
      return;
    }
    sendMessageMutate(message);
  };

  const toggleToolExpand = useCallback((id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClone = async () => {
    if (!session?.config) return;
    setIsCloning(true);
    try {
      const newSession = await cloneAgentAsync(session.config);
      navigate(`/agent/${newSession.id}`);
    } catch {
      // handled by mutation
    } finally {
      setIsCloning(false);
    }
  };

  const handleExport = useCallback(() => {
    downloadConversation(messages, session);
    showToast({
      variant: 'success',
      title: 'Exported',
      message: 'Conversation exported as markdown.',
    });
  }, [messages, session, showToast]);

  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;

  const handleExportSummary = useCallback(() => {
    const metricsSnapshot = currentMetrics || session?.metrics;
    if (!session || !metricsSnapshot) return;
    exportRunSummary({ ...session, metrics: metricsSnapshot });
    showToast({
      variant: 'success',
      title: 'Summary exported',
      message: 'Run summary exported as JSON.',
    });
  }, [session, currentMetrics, showToast]);

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
    else setSearchTerm('');
  };

  const handleReplayLogs = useCallback(() => {
    void (async () => {
      try {
        const cached = await readLogCache();
        if (!cached || cached.length === 0) {
          setHasCachedLogs(false);
          showToast({
            variant: 'info',
            title: 'No cached logs',
            message: 'There are no stored logs for this session yet.',
          });
          return;
        }
        setLogs(cached);
        setShowLogs(true);
      } catch (error) {
        showToast({
          variant: 'error',
          title: 'Failed to load logs',
          message: getErrorMessage(error),
        });
      }
    })();
  }, [readLogCache, showToast, setLogs, setHasCachedLogs]);

  const handleScrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  };

  const openConfig = () => {
    if (session?.config) setConfigDraft(normalizeAgentConfig(session.config));
    setShowConfig(true);
  };

  const handleSaveConfig = () => {
    if (!configDraft) return;
    const normalized = normalizeAgentConfig(configDraft, session?.config);
    setConfigDraft(normalized);
    updateConfig.mutate(normalized);
  };

  const handleResetConfig = () => {
    if (session?.config) setConfigDraft(normalizeAgentConfig(session.config));
  };

  // ── Global keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'f') {
        e.preventDefault();
        if (!showSearch) {
          setShowSearch(true);
          setTimeout(() => searchInputRef.current?.focus(), 0);
        } else searchInputRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'e') {
        e.preventDefault();
        handleExportRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'l') {
        e.preventDefault();
        setShowLogs((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (showSearch) {
          e.preventDefault();
          setShowSearch(false);
          setSearchTerm('');
        } else if (showLogs) {
          e.preventDefault();
          setShowLogs(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLogs, showSearch]);

  // ── Render ────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="w-12 h-12 rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/20 to-transparent flex items-center justify-center shadow-sm"
        >
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </motion.div>
        <p className="text-sm text-slate-400">Loading agent session…</p>
        <div className="h-1 w-36 rounded-full bg-slate-800/70 overflow-hidden">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.1, ease: 'linear' }}
            className="h-full w-1/3 bg-brand-400"
          />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-red-900/10 px-6 py-8 text-center backdrop-blur">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-xl font-semibold text-slate-100 mb-2">Session not found</p>
          <p className="text-sm text-slate-400">
            The session could not be loaded or may no longer exist.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 rounded-lg bg-brand-600/90 hover:bg-brand-500 px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/30">
      <AgentToolbar
        session={session}
        isConnected={isConnected}
        isConnecting={isConnecting}
        isRunning={isRunning}
        isPaused={isPaused}
        isStopped={isStopped}
        isCloning={isCloning}
        isPausing={isPausing}
        isStopping={isStopping}
        showSearch={showSearch}
        showLogs={showLogs}
        showStartStreamCta={showStartStreamCta}
        isStartStreamPending={isStartStreamPending}
        startStreamLabel={startStreamLabel}
        onBack={() => navigate('/')}
        onToggleSearch={toggleSearch}
        onExport={handleExport}
        onClone={handleClone}
        onSaveTemplate={() => setShowSaveTemplate(true)}
        onToggleLogs={() => setShowLogs(!showLogs)}
        onOpenConfig={openConfig}
        onStartAndStream={handleStartAndStream}
        onPause={() => pauseSessionMutate()}
        onStop={() => stopSessionMutate()}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          {/* Search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-slate-800/80 bg-slate-900/20 overflow-hidden"
              >
                <div className="p-3 flex items-center gap-3">
                  <Search className="w-4 h-4 text-brand-400" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search messages, tools, logs..."
                    aria-label="Search messages, tools, logs"
                    className="flex-1 bg-transparent outline-none text-sm placeholder-slate-500 focus-glow rounded"
                  />
                  {searchTerm && (
                    <span className="text-xs text-slate-500">
                      {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={toggleSearch}
                    className="p-1 rounded hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                    aria-label="Close search"
                  >
                    <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 relative"
            role="log"
            aria-live="polite"
            aria-label="Agent messages"
          >
            {showEmptyState ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-center"
              >
                <EmptyState
                  icon={PlayCircle}
                  title="Session idle"
                  description={streamCtaMessage}
                  action={{ label: startStreamLabel, onClick: handleStartAndStream }}
                />
                {hasCachedLogs && (
                  <button
                    type="button"
                    onClick={handleReplayLogs}
                    className="mt-3 text-sm text-brand-200 bg-brand-600/15 border border-brand-500/30 px-3 py-1.5 rounded-full hover:bg-brand-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                  >
                    Replay last logs
                  </button>
                )}
              </motion.div>
            ) : (
              <>
                {showStreamBanner && (
                  <div className="p-3 bg-gradient-to-r from-slate-900/70 via-slate-900/40 to-slate-900/70 border border-slate-700/50 rounded-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between backdrop-blur-sm shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center">
                        {showStreamDisconnected ? (
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                        ) : (
                          <PlayCircle className="w-4 h-4 text-brand-400" />
                        )}
                      </div>
                      <p className="text-sm text-slate-200">{streamCtaMessage}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasCachedLogs && !showLogs && (
                        <button
                          type="button"
                          onClick={handleReplayLogs}
                          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                        >
                          Replay logs
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleStartAndStream}
                        disabled={isStartStreamPending}
                        className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 disabled:opacity-60 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 focus-visible:ring-offset-1"
                      >
                        {startStreamLabel}
                      </button>
                    </div>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {filteredMessages.map((event) => (
                    <MessageItem
                      key={event._id}
                      event={event}
                      isExpanded={expandedTools.has(event._id)}
                      onToggle={toggleToolExpand}
                    />
                  ))}
                </AnimatePresence>
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
                {!autoScroll && (
                  <button
                    type="button"
                    onClick={handleScrollToBottom}
                    className="absolute bottom-4 right-4 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-xs rounded-full shadow-lg border border-slate-600/50 backdrop-blur-sm hover:scale-105 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                  >
                    Jump to latest
                  </button>
                )}
              </>
            )}
          </div>

          <MessageInput
            input={input}
            canSend={canSend}
            isRunning={isRunning}
            isPaused={isPaused}
            isManualMode={isManualMode}
            onInputChange={setInput}
            onSend={handleSend}
          />
        </div>

        <MetricsPanel
          session={session}
          currentStatus={currentStatus || null}
          currentMetrics={currentMetrics || null}
          streamError={streamError}
          showLogs={showLogs}
          logs={logs}
          onClearLogs={() => setLogs([])}
          onExportSummary={handleExportSummary}
        />
      </div>

      {showConfig && (
        <ConfigModal
          configDraft={configDraft}
          isPending={updateConfig.isPending}
          onUpdate={(updates: Partial<AgentSessionConfig>) =>
            setConfigDraft((prev) => (prev ? { ...prev, ...updates } : prev))
          }
          onSave={handleSaveConfig}
          onReset={handleResetConfig}
          onClose={() => setShowConfig(false)}
        />
      )}

      {session?.config && (
        <SaveAsTemplateDialog
          isOpen={showSaveTemplate}
          onClose={() => setShowSaveTemplate(false)}
          agentType={session.agent_type}
          config={session.config}
        />
      )}
    </div>
  );
}
