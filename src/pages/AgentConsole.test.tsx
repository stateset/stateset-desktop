/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';
import type { AgentSession } from '../types';

// --- Shared mutable mock state (hoisted so vi.mock factories can reference it) ---

const mocks = vi.hoisted(() => {
  const streamState = {
    isConnected: false,
    isConnecting: false,
    error: null as string | null,
    messages: [] as Array<Record<string, unknown> & { _id: string }>,
    status: null as string | null,
    metrics: null as Record<string, number> | null,
    isTyping: false,
  };
  const sessionState = {
    session: null as unknown,
    isLoading: false,
    isStarting: false,
    isPausing: false,
    isStopping: false,
  };
  const logCacheState = {
    logs: [] as unknown[],
    hasCachedLogs: false,
  };
  return {
    streamState,
    sessionState,
    logCacheState,
    streamOptions: {
      current: null as null | {
        onEvent?: (event: Record<string, unknown>) => void;
        onError?: (message: string) => void;
      },
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    startSessionAsync: vi.fn(),
    pauseSession: vi.fn(),
    resumeSessionAsync: vi.fn(),
    stopSession: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageAsync: vi.fn(),
    cloneAgentAsync: vi.fn(),
    setLogs: vi.fn(),
    setHasCachedLogs: vi.fn(),
    addLogEntry: vi.fn(),
    readLogCache: vi.fn(),
    downloadConversation: vi.fn(),
    exportRunSummary: vi.fn(),
    updateConfigApi: vi.fn(),
    playMessage: vi.fn(),
    playError: vi.fn(),
    navigate: vi.fn(),
  };
});

// --- Mocks ---

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      tenant: { id: 'tenant-1', name: 'Test' },
      currentBrand: { id: 'brand-1', name: 'Brand' },
      apiKey: 'test-key',
    }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ sessionId: 'session-123' }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('../hooks/useAgentStream', () => ({
  useAgentStream: (options: {
    onEvent?: (event: Record<string, unknown>) => void;
    onError?: (message: string) => void;
  }) => {
    mocks.streamOptions.current = options;
    return {
      isConnected: mocks.streamState.isConnected,
      isConnecting: mocks.streamState.isConnecting,
      error: mocks.streamState.error,
      events: [],
      messages: mocks.streamState.messages,
      status: mocks.streamState.status,
      metrics: mocks.streamState.metrics,
      isTyping: mocks.streamState.isTyping,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
      clearEvents: vi.fn(),
    };
  },
}));

vi.mock('../hooks/useAgentSession', () => ({
  useAgentSession: () => ({
    session: mocks.sessionState.session,
    isLoading: mocks.sessionState.isLoading,
    startSessionAsync: mocks.startSessionAsync,
    pauseSession: mocks.pauseSession,
    resumeSessionAsync: mocks.resumeSessionAsync,
    stopSession: mocks.stopSession,
    sendMessage: mocks.sendMessage,
    sendMessageAsync: mocks.sendMessageAsync,
    cloneAgentAsync: mocks.cloneAgentAsync,
    isStarting: mocks.sessionState.isStarting,
    isPausing: mocks.sessionState.isPausing,
    isStopping: mocks.sessionState.isStopping,
  }),
}));

vi.mock('../hooks/useNotificationSound', () => ({
  useNotificationSound: () => ({ playMessage: mocks.playMessage, playError: mocks.playError }),
}));

vi.mock('../lib/api', () => ({
  agentApi: {
    updateConfig: mocks.updateConfigApi,
  },
}));

// Mock the barrel module that AgentConsole imports from
vi.mock('../features/agent-console', () => ({
  MessageItem: ({ event }: { event: { _id: string } }) => (
    <div data-testid="message-item">{event._id}</div>
  ),
  MetricsPanel: ({
    showLogs,
    logs,
    onExportSummary,
    onClearLogs,
  }: {
    showLogs: boolean;
    logs: unknown[];
    onExportSummary: () => void;
    onClearLogs: () => void;
  }) => (
    <div data-testid="metrics-panel">
      {showLogs && <div data-testid="logs-panel">{logs.length} logs</div>}
      <button type="button" onClick={onExportSummary}>
        panel-export-summary
      </button>
      <button type="button" onClick={onClearLogs}>
        panel-clear-logs
      </button>
    </div>
  ),
  ConfigModal: ({
    isPending,
    onUpdate,
    onSave,
    onReset,
    onClose,
  }: {
    isPending: boolean;
    onUpdate: (updates: Record<string, unknown>) => void;
    onSave: () => void;
    onReset: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="config-modal">
      {isPending && <span>config-saving</span>}
      <button type="button" onClick={() => onUpdate({ model: 'updated-model' })}>
        config-update-draft
      </button>
      <button type="button" onClick={onSave}>
        config-save
      </button>
      <button type="button" onClick={onReset}>
        config-reset
      </button>
      <button type="button" onClick={onClose}>
        config-close
      </button>
    </div>
  ),
  TypingIndicator: () => <div data-testid="typing-indicator">Typing</div>,
  AgentToolbar: ({
    startStreamLabel,
    onToggleSearch,
    onExport,
    onClone,
    onSaveTemplate,
    onToggleLogs,
    onOpenConfig,
    onStartAndStream,
    onPause,
    onStop,
  }: {
    startStreamLabel: string;
    onToggleSearch: () => void;
    onExport: () => void;
    onClone: () => void;
    onSaveTemplate: () => void;
    onToggleLogs: () => void;
    onOpenConfig: () => void;
    onStartAndStream: () => void;
    onPause: () => void;
    onStop: () => void;
  }) => (
    <div data-testid="agent-toolbar">
      <span data-testid="start-stream-label">{startStreamLabel}</span>
      <button type="button" onClick={onToggleSearch}>
        toolbar-search
      </button>
      <button type="button" onClick={onExport}>
        toolbar-export
      </button>
      <button type="button" onClick={onClone}>
        toolbar-clone
      </button>
      <button type="button" onClick={onSaveTemplate}>
        toolbar-save-template
      </button>
      <button type="button" onClick={onToggleLogs}>
        toolbar-logs
      </button>
      <button type="button" onClick={onOpenConfig}>
        toolbar-config
      </button>
      <button type="button" onClick={onStartAndStream}>
        toolbar-start
      </button>
      <button type="button" onClick={onPause}>
        toolbar-pause
      </button>
      <button type="button" onClick={onStop}>
        toolbar-stop
      </button>
    </div>
  ),
  MessageInput: ({
    input,
    canSend,
    onInputChange,
    onSend,
  }: {
    input: string;
    canSend: boolean;
    onInputChange: (value: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="message-input">
      <input
        aria-label="console-message-input"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <button type="button" disabled={!canSend} onClick={onSend}>
        send-message
      </button>
    </div>
  ),
  useLogCache: () => ({
    logs: mocks.logCacheState.logs,
    setLogs: mocks.setLogs,
    hasCachedLogs: mocks.logCacheState.hasCachedLogs,
    setHasCachedLogs: mocks.setHasCachedLogs,
    addLogEntry: mocks.addLogEntry,
    readLogCache: mocks.readLogCache,
  }),
  downloadConversation: mocks.downloadConversation,
  AUTO_SCROLL_THRESHOLD_PX: 100,
  MANUAL_LOOP_INTERVAL_THRESHOLD_MS: 500,
  MANUAL_LOOP_INTERVAL_CLAMP_MS: 1000,
}));

vi.mock('../features/templates', () => ({
  SaveAsTemplateDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="save-template">SaveTemplate</div> : null,
}));

vi.mock('../lib/auth-guards', () => ({
  requireTenantId: (t: { id?: string } | null) => t?.id ?? 'tenant-1',
  requireBrandId: (b: { id?: string } | null) => b?.id ?? 'brand-1',
  requireSessionId: (s: string | undefined) => s ?? 'session-123',
}));

vi.mock('../lib/agentConfig', () => ({
  normalizeAgentConfig: (config: Record<string, unknown> | null) => config ?? {},
}));

vi.mock('../lib/export', () => ({
  exportRunSummary: mocks.exportRunSummary,
}));

vi.mock('../components/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title?: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  ),
}));

// --- Fixtures ---

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-123',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'commerce',
    name: 'Test Agent',
    status: 'running',
    config: {
      loop_interval_ms: 5000,
      max_iterations: 10,
      iteration_timeout_secs: 60,
      pause_on_error: false,
      mcp_servers: null,
      model: 'test-model',
      temperature: 0.5,
    },
    metrics: {
      loop_count: 1,
      tokens_used: 100,
      tool_calls: 2,
      errors: 0,
      messages_sent: 3,
      uptime_seconds: 10,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function manualSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const base = makeSession(overrides);
  return {
    ...base,
    config: { ...base.config, loop_interval_ms: 200 },
  };
}

const messageEvent = (id: string, role: 'user' | 'assistant', content: string) => ({
  _id: id,
  _timestamp: Date.now(),
  type: 'message',
  id,
  role,
  content,
});

const loadAgentConsole = async () => {
  const mod = await import('./AgentConsole');
  return mod.default;
};

describe('AgentConsole page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    mocks.sessionState.session = null;
    mocks.sessionState.isLoading = false;
    mocks.sessionState.isStarting = false;
    mocks.sessionState.isPausing = false;
    mocks.sessionState.isStopping = false;
    mocks.streamState.isConnected = false;
    mocks.streamState.isConnecting = false;
    mocks.streamState.error = null;
    mocks.streamState.messages = [];
    mocks.streamState.status = null;
    mocks.streamState.metrics = null;
    mocks.streamState.isTyping = false;
    mocks.logCacheState.logs = [];
    mocks.logCacheState.hasCachedLogs = false;
    mocks.streamOptions.current = null;
    mocks.readLogCache.mockResolvedValue([]);
    mocks.startSessionAsync.mockResolvedValue(undefined);
    mocks.resumeSessionAsync.mockResolvedValue(undefined);
    mocks.sendMessageAsync.mockResolvedValue(undefined);
    mocks.updateConfigApi.mockResolvedValue({});
    mocks.cloneAgentAsync.mockResolvedValue({ id: 'cloned-1' });
  });

  it('shows session not found when no session is loaded', async () => {
    const AgentConsole = await loadAgentConsole();
    renderWithProviders(<AgentConsole />);

    // useAgentSession returns session: null + isLoading: false → "Session not found"
    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });

  it('shows back to dashboard link', async () => {
    const AgentConsole = await loadAgentConsole();
    renderWithProviders(<AgentConsole />);

    expect(screen.getByText('Back to Dashboard')).toBeInTheDocument();
  });

  it('navigates to dashboard from the not-found screen', async () => {
    const AgentConsole = await loadAgentConsole();
    renderWithProviders(<AgentConsole />);

    fireEvent.click(screen.getByText('Back to Dashboard'));
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('shows loading state while session is loading', async () => {
    mocks.sessionState.isLoading = true;
    const AgentConsole = await loadAgentConsole();
    renderWithProviders(<AgentConsole />);

    expect(screen.getByText(/Loading agent session/)).toBeInTheDocument();
  });

  describe('send message flow', () => {
    it('sends a message via the message input in normal mode', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      const input = screen.getByLabelText('console-message-input');
      fireEvent.change(input, { target: { value: 'hello agent' } });
      fireEvent.click(screen.getByText('send-message'));

      expect(mocks.sendMessage).toHaveBeenCalledWith('hello agent');
      // Input is cleared after send
      expect((screen.getByLabelText('console-message-input') as HTMLInputElement).value).toBe('');
    });

    it('does not send when the input is empty or whitespace', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.change(screen.getByLabelText('console-message-input'), {
        target: { value: '   ' },
      });
      fireEvent.click(screen.getByText('send-message'));

      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.sendMessageAsync).not.toHaveBeenCalled();
    });

    it('resumes a paused manual session before sending', async () => {
      mocks.sessionState.session = manualSession({ status: 'paused' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.change(screen.getByLabelText('console-message-input'), {
        target: { value: 'manual hello' },
      });
      fireEvent.click(screen.getByText('send-message'));

      await waitFor(() => {
        expect(mocks.sendMessageAsync).toHaveBeenCalledWith('manual hello');
      });
      expect(mocks.resumeSessionAsync).toHaveBeenCalled();
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('starts a stopped manual session before sending', async () => {
      mocks.sessionState.session = manualSession({ status: 'stopped' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.change(screen.getByLabelText('console-message-input'), {
        target: { value: 'wake up' },
      });
      fireEvent.click(screen.getByText('send-message'));

      await waitFor(() => {
        expect(mocks.sendMessageAsync).toHaveBeenCalledWith('wake up');
      });
      expect(mocks.startSessionAsync).toHaveBeenCalled();
    });
  });

  describe('config modal', () => {
    it('opens the config modal from the toolbar and closes it', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.queryByTestId('config-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('toolbar-config'));
      expect(screen.getByTestId('config-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('config-close'));
      expect(screen.queryByTestId('config-modal')).not.toBeInTheDocument();
    });

    it('saves config changes and shows a success toast', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-config'));
      fireEvent.click(screen.getByText('config-update-draft'));
      fireEvent.click(screen.getByText('config-save'));

      await waitFor(() => {
        expect(mocks.updateConfigApi).toHaveBeenCalledWith(
          'tenant-1',
          'brand-1',
          'session-123',
          expect.objectContaining({ model: 'updated-model' })
        );
      });
      expect(await screen.findByText('Config updated')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByTestId('config-modal')).not.toBeInTheDocument();
      });
    });

    it('shows an error toast when saving config fails', async () => {
      mocks.updateConfigApi.mockRejectedValue(new Error('save failed'));
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-config'));
      fireEvent.click(screen.getByText('config-save'));

      expect(await screen.findByText('Failed to update config')).toBeInTheDocument();
      // Modal stays open on failure
      expect(screen.getByTestId('config-modal')).toBeInTheDocument();
    });

    it('auto-clamps a too-low loop interval and notifies the user', async () => {
      const session = makeSession({ status: 'running' });
      session.config.loop_interval_ms = 50;
      mocks.sessionState.session = session;
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(await screen.findByText('Loop interval updated')).toBeInTheDocument();
      await waitFor(() => {
        expect(mocks.updateConfigApi).toHaveBeenCalledWith(
          'tenant-1',
          'brand-1',
          'session-123',
          expect.objectContaining({ loop_interval_ms: 1000 })
        );
      });
    });
  });

  describe('search and filter', () => {
    it('toggles the search bar and filters messages by content', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.messages = [
        messageEvent('m1', 'assistant', 'hello world'),
        messageEvent('m2', 'user', 'goodbye moon'),
        {
          _id: 'm3',
          _timestamp: Date.now(),
          type: 'tool_call',
          id: 'm3',
          tool_name: 'search_products',
          arguments: { query: 'shoes' },
        },
      ];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      // All messages visible before searching
      expect(screen.getAllByTestId('message-item')).toHaveLength(3);

      fireEvent.click(screen.getByText('toolbar-search'));
      const searchInput = screen.getByLabelText('Search messages, tools, logs');
      fireEvent.change(searchInput, { target: { value: 'hello' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('message-item')).toHaveLength(1);
      });
      expect(screen.getByText('m1')).toBeInTheDocument();
      expect(screen.queryByText('m2')).not.toBeInTheDocument();
    });

    it('filters tool calls by tool name', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.messages = [
        messageEvent('m1', 'assistant', 'hello world'),
        {
          _id: 'm3',
          _timestamp: Date.now(),
          type: 'tool_call',
          id: 'm3',
          tool_name: 'search_products',
          arguments: { query: 'shoes' },
        },
      ];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-search'));
      fireEvent.change(screen.getByLabelText('Search messages, tools, logs'), {
        target: { value: 'search_products' },
      });

      await waitFor(() => {
        expect(screen.getAllByTestId('message-item')).toHaveLength(1);
      });
      expect(screen.getByText('m3')).toBeInTheDocument();
    });

    it('shows "No results" when nothing matches', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.messages = [messageEvent('m1', 'assistant', 'hello world')];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-search'));
      fireEvent.change(screen.getByLabelText('Search messages, tools, logs'), {
        target: { value: 'zzz-no-match' },
      });

      expect(await screen.findByText('No results')).toBeInTheDocument();
    });

    it('cycles through matches with Enter and Shift+Enter', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.messages = [
        messageEvent('m1', 'assistant', 'hello one'),
        messageEvent('m2', 'assistant', 'hello two'),
      ];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-search'));
      const searchInput = screen.getByLabelText('Search messages, tools, logs');
      fireEvent.change(searchInput, { target: { value: 'hello' } });

      expect(await screen.findByText('1/2')).toBeInTheDocument();

      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(screen.getByText('2/2')).toBeInTheDocument();

      // Wraps around past the last match
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(screen.getByText('1/2')).toBeInTheDocument();

      fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });
      expect(screen.getByText('2/2')).toBeInTheDocument();
    });

    it('closes search and clears the term via the close button', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.messages = [messageEvent('m1', 'assistant', 'hello world')];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-search'));
      fireEvent.change(screen.getByLabelText('Search messages, tools, logs'), {
        target: { value: 'hello' },
      });
      fireEvent.click(screen.getByLabelText('Close search'));

      await waitFor(() => {
        expect(screen.queryByLabelText('Search messages, tools, logs')).not.toBeInTheDocument();
      });
      // All messages shown again
      expect(screen.getAllByTestId('message-item')).toHaveLength(1);
    });

    it('opens search with Ctrl+F', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      expect(screen.getByLabelText('Search messages, tools, logs')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByLabelText('Search messages, tools, logs')).not.toBeInTheDocument();
      });
    });
  });

  describe('export', () => {
    it('exports the conversation from the toolbar', async () => {
      const session = makeSession({ status: 'running' });
      mocks.sessionState.session = session;
      mocks.streamState.messages = [messageEvent('m1', 'assistant', 'hello world')];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-export'));

      expect(mocks.downloadConversation).toHaveBeenCalledWith(mocks.streamState.messages, session);
      expect(await screen.findByText('Exported')).toBeInTheDocument();
    });

    it('exports the conversation with Ctrl+E', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
      expect(mocks.downloadConversation).toHaveBeenCalled();
    });

    it('exports the run summary from the metrics panel', async () => {
      const session = makeSession({ status: 'running' });
      mocks.sessionState.session = session;
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('panel-export-summary'));

      expect(mocks.exportRunSummary).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'session-123', metrics: session.metrics })
      );
      expect(await screen.findByText('Summary exported')).toBeInTheDocument();
    });
  });

  describe('log replay', () => {
    it('shows the replay button in the idle empty state and restores cached logs', async () => {
      mocks.sessionState.session = makeSession({ status: 'stopped' });
      mocks.logCacheState.hasCachedLogs = true;
      const cached = [{ level: 'info', message: 'old log', source: 'agent' }];
      mocks.readLogCache.mockResolvedValue(cached);
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('Replay last logs'));

      await waitFor(() => {
        expect(mocks.setLogs).toHaveBeenCalledWith(cached);
      });
      // Logs panel opens after replay
      expect(screen.getByTestId('logs-panel')).toBeInTheDocument();
    });

    it('informs the user when there are no cached logs', async () => {
      mocks.sessionState.session = makeSession({ status: 'stopped' });
      mocks.logCacheState.hasCachedLogs = true;
      mocks.readLogCache.mockResolvedValue([]);
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('Replay last logs'));

      expect(await screen.findByText('No cached logs')).toBeInTheDocument();
      expect(mocks.setHasCachedLogs).toHaveBeenCalledWith(false);
      expect(mocks.setLogs).not.toHaveBeenCalled();
    });

    it('shows an error toast when reading the log cache fails', async () => {
      mocks.sessionState.session = makeSession({ status: 'stopped' });
      mocks.logCacheState.hasCachedLogs = true;
      mocks.readLogCache.mockRejectedValue(new Error('cache corrupted'));
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('Replay last logs'));

      expect(await screen.findByText('Failed to load logs')).toBeInTheDocument();
    });

    it('toggles the logs panel with Ctrl+Shift+L', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.queryByTestId('logs-panel')).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'l', ctrlKey: true, shiftKey: true });
      expect(screen.getByTestId('logs-panel')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'l', ctrlKey: true, shiftKey: true });
      expect(screen.queryByTestId('logs-panel')).not.toBeInTheDocument();
    });
  });

  describe('pause/resume/stop actions', () => {
    it('pauses the session from the toolbar', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-pause'));
      expect(mocks.pauseSession).toHaveBeenCalled();
    });

    it('stops the session from the toolbar', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-stop'));
      expect(mocks.stopSession).toHaveBeenCalled();
    });

    it('starts a stopped session and connects the stream', async () => {
      mocks.sessionState.session = makeSession({ status: 'stopped' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.getByTestId('start-stream-label')).toHaveTextContent('Start & Stream');

      fireEvent.click(screen.getByText('toolbar-start'));
      await waitFor(() => {
        expect(mocks.startSessionAsync).toHaveBeenCalled();
      });
      expect(mocks.connect).toHaveBeenCalled();
      expect(mocks.resumeSessionAsync).not.toHaveBeenCalled();
    });

    it('resumes a paused session and connects the stream', async () => {
      mocks.sessionState.session = makeSession({ status: 'paused' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      // Paused + disconnected stream: the reconnect label takes precedence over resume.
      expect(screen.getByTestId('start-stream-label')).toHaveTextContent('Reconnect Stream');
      mocks.connect.mockClear(); // connect is called on mount for paused sessions

      fireEvent.click(screen.getByText('toolbar-start'));
      await waitFor(() => {
        expect(mocks.resumeSessionAsync).toHaveBeenCalled();
      });
      expect(mocks.connect).toHaveBeenCalled();
      expect(mocks.startSessionAsync).not.toHaveBeenCalled();
    });

    it('connects without starting in manual mode and shows a hint toast', async () => {
      mocks.sessionState.session = manualSession({ status: 'stopped' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.getByTestId('start-stream-label')).toHaveTextContent('Connect & Stream');

      fireEvent.click(screen.getByText('toolbar-start'));
      expect(mocks.connect).toHaveBeenCalled();
      expect(mocks.startSessionAsync).not.toHaveBeenCalled();
      expect(await screen.findByText('Manual mode')).toBeInTheDocument();
    });

    it('auto-pauses a running manual-mode session', async () => {
      mocks.sessionState.session = manualSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      await waitFor(() => {
        expect(mocks.pauseSession).toHaveBeenCalled();
      });
    });

    it('offers stream reconnect when running but disconnected', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.isConnected = false;
      mocks.streamState.isConnecting = false;
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.getByTestId('start-stream-label')).toHaveTextContent('Reconnect Stream');
      expect(
        screen.getByText('Live stream disconnected. Reconnect to resume updates.')
      ).toBeInTheDocument();
    });
  });

  describe('stream events', () => {
    it('plays a sound and logs when an assistant message arrives', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      act(() => {
        mocks.streamOptions.current?.onEvent?.({
          type: 'message',
          id: 'e1',
          role: 'assistant',
          content: 'hi there',
        });
      });

      expect(mocks.playMessage).toHaveBeenCalled();
      expect(mocks.addLogEntry).toHaveBeenCalledWith(
        'info',
        'Assistant message received',
        'stream'
      );
    });

    it('plays the error sound and logs stream errors', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      act(() => {
        mocks.streamOptions.current?.onEvent?.({
          type: 'error',
          code: 'E42',
          message: 'agent exploded',
          recoverable: false,
        });
      });

      expect(mocks.playError).toHaveBeenCalled();
      expect(mocks.addLogEntry).toHaveBeenCalledWith('error', 'E42: agent exploded', 'stream');
    });

    it('records log events with their metadata source', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      act(() => {
        mocks.streamOptions.current?.onEvent?.({
          type: 'log',
          level: 'warn',
          message: 'low disk',
          metadata: { source: 'sandbox' },
        });
      });

      expect(mocks.addLogEntry).toHaveBeenCalledWith('warn', 'low disk', 'sandbox', {
        source: 'sandbox',
      });
    });

    it('shows a toast when the stream reports an error', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      act(() => {
        mocks.streamOptions.current?.onError?.('connection dropped');
      });

      expect(await screen.findByText('Stream error')).toBeInTheDocument();
      expect(mocks.addLogEntry).toHaveBeenCalledWith('error', 'connection dropped', 'connection');
    });
  });

  describe('clone and templates', () => {
    it('clones the agent and navigates to the new session', async () => {
      const session = makeSession({ status: 'running' });
      mocks.sessionState.session = session;
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      fireEvent.click(screen.getByText('toolbar-clone'));

      await waitFor(() => {
        expect(mocks.cloneAgentAsync).toHaveBeenCalledWith(session.config);
      });
      await waitFor(() => {
        expect(mocks.navigate).toHaveBeenCalledWith('/agent/cloned-1');
      });
    });

    it('opens the save-as-template dialog from the toolbar', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.queryByTestId('save-template')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('toolbar-save-template'));
      expect(screen.getByTestId('save-template')).toBeInTheDocument();
    });
  });

  describe('typing indicator', () => {
    it('renders the typing indicator while the agent is typing', async () => {
      mocks.sessionState.session = makeSession({ status: 'running' });
      mocks.streamState.isTyping = true;
      mocks.streamState.messages = [messageEvent('m1', 'assistant', 'hello')];
      const AgentConsole = await loadAgentConsole();
      renderWithProviders(<AgentConsole />);

      expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    });
  });
});
