/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';

// --- Mocks ---

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
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
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../hooks/useAgentStream', () => ({
  useAgentStream: () => ({
    isConnected: false,
    isConnecting: false,
    error: null,
    events: [],
    messages: [],
    status: null,
    metrics: null,
    isTyping: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearEvents: vi.fn(),
  }),
}));

vi.mock('../hooks/useAgentSession', () => ({
  useAgentSession: () => ({
    session: null,
    isLoading: false,
    startSessionAsync: vi.fn(),
    pauseSession: vi.fn(),
    resumeSessionAsync: vi.fn(),
    stopSession: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageAsync: vi.fn(),
    cloneAgentAsync: vi.fn(),
    isStarting: false,
    isPausing: false,
    isStopping: false,
  }),
}));

vi.mock('../hooks/useNotificationSound', () => ({
  useNotificationSound: () => ({ playMessage: vi.fn(), playError: vi.fn() }),
}));

// Mock the barrel module that AgentConsole imports from
vi.mock('../features/agent-console', () => ({
  MessageItem: ({ event }: { event?: { _id?: string } }) => (
    <div data-testid="message-item">{event?._id}</div>
  ),
  MetricsPanel: () => <div data-testid="metrics-panel">MetricsPanel</div>,
  ConfigModal: () => <div data-testid="config-modal">ConfigModal</div>,
  TypingIndicator: () => <div data-testid="typing-indicator">Typing</div>,
  AgentToolbar: () => <div data-testid="agent-toolbar">Toolbar</div>,
  MessageInput: () => <div data-testid="message-input">MessageInput</div>,
  useLogCache: () => ({
    logs: [],
    setLogs: vi.fn(),
    hasCachedLogs: false,
    setHasCachedLogs: vi.fn(),
    addLogEntry: vi.fn(),
    readLogCache: vi.fn().mockResolvedValue([]),
  }),
  downloadConversation: vi.fn(),
  AUTO_SCROLL_THRESHOLD_PX: 100,
  MANUAL_LOOP_INTERVAL_THRESHOLD_MS: 500,
  MANUAL_LOOP_INTERVAL_CLAMP_MS: 1000,
}));

vi.mock('../features/templates', () => ({
  SaveAsTemplateDialog: () => <div data-testid="save-template">SaveTemplate</div>,
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
  exportRunSummary: vi.fn(),
}));

vi.mock('../components/EmptyState', () => ({
  EmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));

const loadAgentConsole = async () => {
  const mod = await import('./AgentConsole');
  return mod.default;
};

describe('AgentConsole page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
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
});
