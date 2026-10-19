/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render as renderReact,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DurableComputerChat } from './DurableComputerChat';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import type { ReactElement } from 'react';
import { useComputerChatsStore } from './store';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { useAuthStore } from '../../stores/auth';
import { DEFAULT_CHAT_CONFIGURATION, type DurableChatStatus } from './durableTypes';
import type { ComputerChat } from './types';
import { durableChatController } from './durable';
import requiredSetupChecks from './setup-checks.json';
vi.mock('../chat-playground/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
}));
function fixture(title: string): ComputerChat {
  const id = crypto.randomUUID();
  const state: DurableChatStatus = {
    version: 1,
    status: 'idle',
    request_id: id,
    brand_id: 'brand',
    session: { id: 'session', organizationId: 'org', status: 'running' },
    messages: [],
    events: [],
    last_event_id: 0,
    pending_action: null,
    artifacts: [],
    verification: null,
    workspace: null,
    screenshot: null,
    checkpoint: null,
    usage: {},
    budget: DEFAULT_CHAT_CONFIGURATION.budget,
    actions: 0,
    turns: 0,
    tokens: 0,
    paused: false,
    stop_requested: false,
    cleanup_verified: false,
    error: null,
    generation: 0,
  };
  return {
    id,
    title,
    tenantId: 'tenant',
    brandId: 'brand',
    createdAt: '',
    updatedAt: '',
    messages: [{ id: 'old', role: 'user', content: 'Earlier retained instruction', timestamp: 1 }],
    workflows: [],
    serverState: state,
    timeline: [{ id: 1, kind: 'action_completed', at: 1, detail: { source: 'cached evidence' } }],
    durableSession: {
      version: 2,
      workflowId: id,
      engineUrl: 'https://engine.example',
      configuration: DEFAULT_CHAT_CONFIGURATION,
    },
  };
}
beforeEach(() => {
  const own = fixture('My computer');
  useComputerChatsStore.setState({
    chats: [own, { ...fixture('Other brand'), brandId: 'different' }],
    loaded: true,
    busy: {},
    connections: {},
    persistenceError: undefined,
    configurations: {},
  });
  useDurableWorkflowsStore.setState({
    initialized: true,
    engineUrl: 'https://engine.example',
    apiKey: 'key',
  });
  useAuthStore.setState({ tenant: { id: 'tenant' }, currentBrand: { id: 'brand' } } as never);
  window.electronAPI = {
    store: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) },
  } as unknown as typeof window.electronAPI;
});
afterEach(async () => {
  cleanup();
  await useComputerChatsStore
    .getState()
    .flush()
    .catch(() => undefined);
  vi.restoreAllMocks();
});
function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current route">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Go back in history</button>
    </>
  );
}
function render(ui: ReactElement, route = '/playground') {
  return renderReact(
    <MemoryRouter initialEntries={[route]}>
      {ui}
      <NavigationProbe />
    </MemoryRouter>
  );
}
describe('durable chat workspace integration', () => {
  it('loads saved defaults when entering a brand without carrying another brand’s edits', () => {
    useComputerChatsStore.setState({
      configurations: {
        'tenant:brand': { ...DEFAULT_CHAT_CONFIGURATION, model: 'first-brand-model' },
        'tenant:other': { ...DEFAULT_CHAT_CONFIGURATION, model: 'second-brand-model' },
      },
    });
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByText('Defaults and permissions'));
    expect(screen.getByLabelText('Computer chat model')).toHaveValue('first-brand-model');
    fireEvent.change(screen.getByLabelText('Computer chat model'), {
      target: { value: 'unsaved-first-brand-draft' },
    });
    act(() => useAuthStore.setState({ currentBrand: { id: 'other' } } as never));
    fireEvent.click(screen.getByText('Defaults and permissions'));
    expect(screen.getByLabelText('Computer chat model')).toHaveValue('second-brand-model');
  });
  it('keeps edited settings when an earlier defaults save is acknowledged', async () => {
    let release!: (value: boolean) => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementation((key) =>
      key === 'computerChatPreferences'
        ? new Promise<boolean>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(true)
    );
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByText('Defaults and permissions'));
    fireEvent.click(screen.getByRole('button', { name: 'Save defaults for this brand' }));
    await waitFor(() => expect(release).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('Computer chat model'), {
      target: { value: 'newer-model' },
    });
    await act(async () => release(true));
    expect(screen.getByLabelText('Computer chat model')).toHaveValue('newer-model');
    expect(screen.queryByText('Defaults saved')).not.toBeInTheDocument();
  });
  it('keeps the current draft when another brand saves its defaults', async () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByText('Defaults and permissions'));
    fireEvent.change(screen.getByLabelText('Computer chat model'), {
      target: { value: 'current-draft' },
    });
    await act(async () =>
      useComputerChatsStore.getState().setConfiguration('tenant:different', {
        ...DEFAULT_CHAT_CONFIGURATION,
        model: 'other-brand-model',
      })
    );
    expect(screen.getByLabelText('Computer chat model')).toHaveValue('current-draft');
  });
  it('opens a linked conversation and follows browser history without replaying its messages', () => {
    const first = useComputerChatsStore.getState().chats[0];
    const second = fixture('Second computer');
    useComputerChatsStore.setState((s) => ({ chats: [...s.chats, second] }));
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${first.id}`);
    expect(screen.getByLabelText('Chat message')).toBeVisible();
    fireEvent.click(screen.getByText('Second computer', { exact: true }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(second.id);
    fireEvent.click(screen.getByRole('button', { name: 'Go back in history' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(first.id);
    expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
    expect(useComputerChatsStore.getState().chats.every((c) => !c.pendingMessage)).toBe(true);
  });

  it('restores the last opened scoped chat and its draft when reopening Chats', () => {
    const own = useComputerChatsStore.getState().chats[0];
    useComputerChatsStore.setState((s) => ({
      chats: s.chats.map((chat) => ({
        ...chat,
        lastOpenedAt: chat.id === own.id ? '2026-10-14T00:00:00Z' : '2026-10-15T00:00:00Z',
        draft: 'Preserved draft',
      })),
    }));
    render(<DurableComputerChat initialRuntime="workflow" />);
    expect(screen.getByRole('heading', { name: 'My computer' })).toBeVisible();
    expect(screen.getByLabelText('Chat message')).toHaveValue('Preserved draft');
    expect(screen.queryByText('Other brand')).not.toBeInTheDocument();
  });

  it('does not reveal or open a linked conversation from another brand', () => {
    const foreign = useComputerChatsStore.getState().chats[1];
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${foreign.id}`);
    expect(screen.getByRole('heading', { name: 'Conversation unavailable' })).toBeVisible();
    expect(screen.queryByLabelText('Chat message')).not.toBeInTheDocument();
    expect(screen.queryByText('Other brand')).not.toBeInTheDocument();
    expect(useComputerChatsStore.getState().chats[1].lastOpenedAt).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(screen.getByLabelText('Current route')).not.toHaveTextContent('chat=');
  });

  it('restores the selected brand’s own last chat and clears the previous route on a brand switch', () => {
    const first = useComputerChatsStore.getState().chats[0];
    const foreign = useComputerChatsStore.getState().chats[1];
    useComputerChatsStore.setState((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === foreign.id ? { ...chat, lastOpenedAt: '2026-10-14T00:00:00Z' } : chat
      ),
    }));
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${first.id}`);
    expect(screen.getByRole('heading', { name: 'My computer' })).toBeVisible();
    act(() => useAuthStore.setState({ currentBrand: { id: 'different' } } as never));
    expect(screen.getByRole('heading', { name: 'Other brand' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).not.toHaveTextContent('chat=');
    expect(screen.queryByRole('heading', { name: 'My computer' })).not.toBeInTheDocument();
  });

  it('preserves a requested chat while the initial brand selection is loading', () => {
    const own = useComputerChatsStore.getState().chats[0];
    useAuthStore.setState({ currentBrand: null });
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${own.id}`);
    act(() => useAuthStore.setState({ currentBrand: { id: 'brand' } } as never));
    expect(screen.getByRole('heading', { name: 'My computer' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(own.id);
  });

  it('opens the library and focuses search from the keyboard without losing the draft', () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Keep this draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversations' }));
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'f', ctrlKey: true });
    const search = screen.getByRole('searchbox', { name: 'Search conversations' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'missing' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(screen.getByLabelText('Chat message')).toHaveValue('Keep this draft');
  });
  it('closes the conversation drawer after selecting a chat in a narrow window', () => {
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    try {
      render(<DurableComputerChat initialRuntime="workflow" />);
      fireEvent.click(screen.getByText('My computer', { exact: true }));
      expect(
        screen.queryByRole('complementary', { name: 'Computer conversations' })
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Chat message')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Show conversations' }));
      expect(screen.getByRole('complementary', { name: 'Computer conversations' })).toBeVisible();
    } finally {
      media.mockRestore();
    }
  });
  it('keeps independent drafts when switching chats and reopening the workspace', async () => {
    const second = fixture('Second computer');
    useComputerChatsStore.setState((s) => ({ chats: [...s.chats, second] }));
    const { unmount } = render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Unsent instruction' },
    });
    fireEvent.click(screen.getByText('Second computer', { exact: true }));
    expect(screen.getByLabelText('Chat message')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Second draft' } });
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    expect(screen.getByLabelText('Chat message')).toHaveValue('Unsent instruction');
    unmount();
    await useComputerChatsStore.getState().flushDrafts();
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('Second computer', { exact: true }));
    expect(screen.getByLabelText('Chat message')).toHaveValue('Second draft');
    expect(useComputerChatsStore.getState().chats.every((chat) => !chat.pendingMessage)).toBe(true);
  });
  it('opens the retained transcript and timeline from the scoped library', () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    expect(screen.queryByText('Other brand')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    expect(screen.getByText('Earlier retained instruction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show computer details' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('Action finished')).toBeInTheDocument();
    expect(screen.getByText(/cached evidence/)).toBeInTheDocument();
  });
  it('reveals settings when a new computer needs a connection check', () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    expect(
      screen.queryByRole('region', { name: 'Computer setup and defaults' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(screen.getByRole('region', { name: 'Computer setup and defaults' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('supports keyboard tabs and returns focus when computer details are dismissed', () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    expect(
      screen.queryByRole('complementary', { name: 'Computer workspace and evidence' })
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show computer details' });
    fireEvent.click(toggle);
    const computer = screen.getByRole('tab', { name: 'Computer' });
    computer.focus();
    fireEvent.keyDown(computer, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Timeline' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Timeline' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Files' }), { key: 'Escape' });
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  it('preserves a selected running computer when the chat is archived', () => {
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    fireEvent.click(screen.getByLabelText('Options for My computer'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive chat' }));
    expect(screen.getByText(/This chat is archived/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop computer' })).toBeInTheDocument();
    expect(
      useComputerChatsStore.getState().chats.find((c) => c.title === 'My computer')?.serverState
        ?.session?.id
    ).toBe('session');
  });
  it('makes failed local saves visible and lets the user retry without restarting work', async () => {
    useComputerChatsStore.setState({ persistenceError: 'Device storage full' });
    render(<DurableComputerChat initialRuntime="workflow" />);
    expect(screen.getByText(/Recent chat changes could not be saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving chats' }));
    await waitFor(() =>
      expect(screen.queryByText(/Recent chat changes could not be saved/)).not.toBeInTheDocument()
    );
    expect(useComputerChatsStore.getState().chats).toHaveLength(2);
  });
});

describe('actionable conversation attention', () => {
  it('shows the same failed acceptance label in the header and library', () => {
    const own = useComputerChatsStore.getState().chats[0];
    useComputerChatsStore.setState({
      chats: [
        {
          ...own,
          serverState: {
            ...own.serverState!,
            verification: {
              verified: false,
              outcome: 'failed',
              manifest_sha256: 'm',
              checks: [],
              evidence_ids: [],
            },
          },
        },
      ],
    });
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${own.id}`);
    expect(screen.getByLabelText('Conversation status')).toHaveTextContent(
      'Acceptance check failed'
    );
    expect(screen.getAllByText('Acceptance check failed')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'Needs attention (1)' })).toBeInTheDocument();
  });
  it('opens connection settings, focuses its URL, and returns focus on Escape', () => {
    const own = useComputerChatsStore.getState().chats[0];
    useDurableWorkflowsStore.setState({ engineUrl: 'https://other.example' });
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${own.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Open connection settings' }));
    const url = screen.getByLabelText('Workflow engine URL');
    expect(url).toHaveFocus();
    fireEvent.keyDown(url, { key: 'Escape', isComposing: true });
    expect(screen.getByRole('region', { name: 'Computer setup and defaults' })).toBeVisible();
    fireEvent.keyDown(url, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Computer setup and defaults' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Settings$/ })).toHaveFocus();
  });
  it('closes the narrow conversation drawer with Escape after search is cleared', () => {
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    try {
      render(<DurableComputerChat initialRuntime="workflow" />);
      const search = screen.getByRole('searchbox', { name: 'Search conversations' });
      fireEvent.change(search, { target: { value: 'query' } });
      fireEvent.keyDown(search, { key: 'Escape' });
      expect(search).toHaveValue('');
      expect(screen.getByRole('complementary', { name: 'Computer conversations' })).toBeVisible();
      fireEvent.keyDown(search, { key: 'Escape' });
      expect(screen.queryByRole('complementary', { name: 'Computer conversations' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Show conversations' })).toHaveFocus();
    } finally {
      media.mockRestore();
    }
  });
  it('retains the complete unconfirmed message without offering to resend it to an ended computer', () => {
    const own = useComputerChatsStore.getState().chats[0];
    const content = 'Unconfirmed instruction '.repeat(10);
    useComputerChatsStore.setState({
      chats: [
        {
          ...own,
          pendingMessage: { id: 'pending', content },
          serverState: { ...own.serverState!, status: 'stopped', cleanup_verified: true },
        },
      ],
    });
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${own.id}`);
    expect(screen.getByRole('button', { name: 'Resend safely' })).toBeDisabled();
    fireEvent.click(screen.getByText('View unconfirmed message'));
    expect(screen.getByText(content.trim(), { exact: true })).toBeVisible();
    expect(screen.getByText(/Its text remains saved here/)).toBeInTheDocument();
    expect(screen.getByText(/Message not confirmed before this computer ended:/)).toBeVisible();
    expect(useComputerChatsStore.getState().chats[0].pendingMessage?.content).toBe(content);
  });
});

it('keeps an ended saved chat read-only while its server snapshot is unavailable', () => {
  const own = useComputerChatsStore.getState().chats[0];
  useComputerChatsStore.setState({
    chats: [
      {
        ...own,
        stopped: true,
        serverState: undefined,
        pendingMessage: { id: 'pending', content: 'Unconfirmed instruction' },
      },
    ],
  });
  render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${own.id}`);
  expect(screen.getByRole('button', { name: 'Resend safely' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Connect computer workflow' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Continue transcript in a new computer' })
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show computer details' }));
  expect(screen.getByText('No screenshot was saved for this computer.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Refresh desktop screenshot' })).toBeDisabled();
});

function withApproval() {
  const chat = useComputerChatsStore.getState().chats[0];
  const pending: NonNullable<DurableChatStatus['pending_action']> = {
    request_id: 'action-review',
    name: 'execute',
    arguments: {},
    command: ['python3', 'report.py'],
    review_started_ms: Date.now(),
    result_available: false,
    rewritten: false,
    admission: {
      final_verdict: 'ask_user',
      evidence_ids: [],
      evaluation: { canonical_action_hash: 'hash', triggered_rules: [] },
    },
  };
  const updated = {
    ...chat,
    serverState: { ...chat.serverState!, status: 'awaiting_approval', pending_action: pending },
  };
  useComputerChatsStore.setState((s) => ({
    chats: s.chats.map((c) => (c.id === chat.id ? updated : c)),
    connections: { [chat.id]: { status: 'connected', failures: 0 } },
  }));
  return updated;
}
function updateApproval(chat: ComputerChat, patch: Partial<DurableChatStatus>) {
  useComputerChatsStore.setState((s) => ({
    chats: s.chats.map((c) =>
      c.id === chat.id ? { ...c, serverState: { ...c.serverState!, ...patch } } : c
    ),
  }));
}
describe('approval keyboard navigation', () => {
  it('lets the user focus the pending review without submitting it', () => {
    const chat = withApproval();
    const scroll = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Review pending action' }));
    expect(screen.getByRole('heading', { name: 'Review action' })).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(screen.getByRole('button', { name: 'Review pending action' })).toHaveAttribute(
      'aria-controls',
      `chat-approval-${chat.id}`
    );
  });
  it('returns focus to the conversation heading after the focused review disappears', async () => {
    const chat = withApproval();
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    act(() => screen.getByRole('heading', { name: 'Review action' }).focus());
    await act(async () => updateApproval(chat, { status: 'thinking', pending_action: null }));
    expect(screen.getByRole('heading', { name: chat.title })).toHaveFocus();
  });
  it('moves focus to the revised review when its displayed action changes', async () => {
    const chat = withApproval();
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    act(() => screen.getByRole('button', { name: 'Approve action' }).focus());
    await act(async () =>
      updateApproval(chat, {
        pending_action: {
          ...chat.serverState!.pending_action!,
          command: ['python3', 'changed.py'],
        },
      })
    );
    expect(screen.getByRole('heading', { name: 'Review action' })).toHaveFocus();
  });
  it('keeps focus in the draft when an approval arrives or disappears in the background', async () => {
    const chat = useComputerChatsStore.getState().chats[0];
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    const input = screen.getByLabelText('Chat message');
    act(() => input.focus());
    await act(async () => {
      withApproval();
    });
    expect(input).toHaveFocus();
    await act(async () => updateApproval(chat, { status: 'thinking', pending_action: null }));
    expect(input).toHaveFocus();
  });
  it('does not reclaim focus after the user moves to another control', async () => {
    const chat = withApproval();
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    act(() => screen.getByRole('button', { name: 'Approve action' }).focus());
    const target = screen.getByRole('button', { name: 'Show computer details' });
    act(() => target.focus());
    await act(async () => updateApproval(chat, { status: 'thinking', pending_action: null }));
    expect(target).toHaveFocus();
  });
  it('never focuses another conversation on a review’s removal', async () => {
    const chat = withApproval();
    const second = fixture('Another computer');
    useComputerChatsStore.setState((s) => ({ chats: [...s.chats, second] }));
    render(<DurableComputerChat initialRuntime="workflow" />, `/playground?chat=${chat.id}`);
    act(() => screen.getByRole('heading', { name: 'Review action' }).focus());
    await act(async () => {
      fireEvent.click(screen.getByText('Another computer', { exact: true }));
    });
    expect(screen.getByRole('heading', { name: second.title })).not.toHaveFocus();
  });
});

describe('narrow workspace panels', () => {
  it('opens one drawer at a time and lets conversation search take focus', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByText('My computer', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Show computer details' }));
    expect(
      screen.queryByRole('complementary', { name: 'Computer conversations' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show conversations' }));
    expect(screen.getByRole('complementary', { name: 'Computer conversations' })).toBeVisible();
    expect(
      screen.queryByRole('complementary', { name: 'Computer workspace and evidence' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show computer details' }));
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'f', ctrlKey: true });
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveFocus();
    expect(
      screen.queryByRole('complementary', { name: 'Computer workspace and evidence' })
    ).not.toBeInTheDocument();
  });
  it.each(['library', 'details'])(
    'keeps the focused %s panel when resizing to a narrow window',
    (target) => {
      let changed!: () => void;
      const media = {
        matches: false,
        addEventListener: (_name: string, callback: () => void) => {
          changed = callback;
        },
        removeEventListener: () => undefined,
      };
      vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
      render(<DurableComputerChat initialRuntime="workflow" />);
      fireEvent.click(screen.getByText('My computer', { exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Show computer details' }));
      const focus =
        target === 'library'
          ? screen.getByRole('searchbox', { name: 'Search conversations' })
          : screen.getByRole('tab', { name: 'Timeline' });
      act(() => focus.focus());
      act(() => {
        media.matches = true;
        changed();
      });
      expect(focus).toHaveFocus();
      if (target === 'library')
        expect(
          screen.queryByRole('complementary', { name: 'Computer workspace and evidence' })
        ).not.toBeInTheDocument();
      else
        expect(
          screen.queryByRole('complementary', { name: 'Computer conversations' })
        ).not.toBeInTheDocument();
    }
  );
});

describe('checked computer creation', () => {
  const diagnostics = {
    version: 1,
    ready: true,
    checks: requiredSetupChecks.map((key) => ({
      key,
      status: 'pass',
      message: key === 'sandbox' ? 'Setup checked' : `${key} configured`,
    })),
    mcp_servers: [{ key: 'reports', ready: true }],
  };
  async function checked() {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200, body: diagnostics });
    window.electronAPI!.computerChat = { request } as never;
    const provision = vi.spyOn(durableChatController, 'provision').mockResolvedValue(undefined);
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save connection and check' }));
    await screen.findByText(/Setup checked/);
    return { request, provision };
  }
  it('creates a computer only for the successfully checked setup', async () => {
    const { provision } = await checked();
    const previous = useComputerChatsStore.getState().chats.length;
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(provision).toHaveBeenCalledTimes(1));
    expect(useComputerChatsStore.getState().chats).toHaveLength(previous + 1);
  });
  it.each(['engine', 'credential', 'tools', 'brand'])(
    'requires a new check after changing %s',
    async (kind) => {
      const { provision } = await checked();
      const previous = useComputerChatsStore.getState().chats.length;
      if (kind === 'engine')
        act(() => useDurableWorkflowsStore.setState({ engineUrl: 'https://other.example' }));
      if (kind === 'credential')
        act(() => useDurableWorkflowsStore.setState({ apiKey: 'rotated' }));
      if (kind === 'brand')
        act(() => useAuthStore.setState({ currentBrand: { id: 'other' } } as never));
      if (kind === 'tools') {
        fireEvent.click(screen.getByText('Defaults and permissions'));
        fireEvent.click(screen.getByRole('checkbox', { name: 'reports' }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('run its checks'));
      expect(provision).not.toHaveBeenCalled();
      expect(useComputerChatsStore.getState().chats).toHaveLength(previous);
    }
  );
  it('does not accept an old brand’s delayed check for the newly selected brand', async () => {
    let release!: () => void;
    const request = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, body: diagnostics });
        })
    );
    window.electronAPI!.computerChat = { request } as never;
    const provision = vi.spyOn(durableChatController, 'provision').mockResolvedValue(undefined);
    render(<DurableComputerChat initialRuntime="workflow" />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save connection and check' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.setState({ currentBrand: { id: 'other' } } as never));
    await act(async () => release());
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(provision).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('run its checks');
  });
});
