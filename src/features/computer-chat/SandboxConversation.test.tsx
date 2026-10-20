/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableComputerChat } from './DurableComputerChat';
import { useComputerChatsStore as store } from './store';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { computerSessionApi } from './api';
import { computerChatRuntime } from './runtime';
import { SandboxRequestError } from '../../lib/sandbox';
import { localSecretsApi } from '../../lib/localSecrets';
import { SandboxConversation } from './SandboxConversation';
import type { ComputerChat } from './types';
import { sandboxPreferencesKey } from './sandboxPreferences';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  computerSessionApi: {
    create: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    stop: vi.fn(),
    sandboxStopped: vi.fn(),
    stopSandbox: vi.fn(),
    infer: vi.fn(),
    execute: vi.fn(),
  },
}));
const session = (id: string, status = 'running') => ({
  id,
  organizationId: 'sandbox-org',
  status,
  currentSandboxId: status === 'running' ? `sandbox-${id}` : null,
});
const chats = () => store.getState().chats;
const mount = () =>
  render(
    <MemoryRouter>
      <DurableComputerChat />
    </MemoryRouter>
  );
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  window.electronAPI = { store: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) } } as never;
  store.setState({
    chats: [],
    loaded: true,
    busy: {},
    activities: {},
    connections: {},
    configurations: {},
    sandboxPreferences: {},
    persistenceError: undefined,
  });
  useAuthStore.setState({
    tenant: { id: 'tenant' },
    currentBrand: { id: 'brand' },
    sandboxApiKey: 'sandbox-key',
  } as never);
  useDurableWorkflowsStore.setState({ initialized: true, apiKey: null, initializationError: null });
  vi.mocked(computerSessionApi.create).mockImplementation(async (id) => session(id, 'pending'));
  vi.mocked(computerSessionApi.start).mockImplementation(async (id) => session(id));
  vi.mocked(computerSessionApi.get).mockImplementation(async (id) => session(id));
  vi.mocked(computerSessionApi.stop).mockResolvedValue(undefined);
});
afterEach(async () => {
  cleanup();
  await store
    .getState()
    .flush()
    .catch(() => undefined);
  vi.restoreAllMocks();
});

describe('Sandbox API chat creation', () => {
  it('shows a pending pause during startup, retains the returned identity and keeps drafts editable', async () => {
    let finish!: () => void;
    vi.mocked(computerSessionApi.start).mockImplementationOnce(
      (id) =>
        new Promise((resolve) => {
          finish = () => resolve(session(id));
        })
    );
    mount();
    await click('New chat');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    try {
      await click('Pause setup');
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Pausing…'
      );
      expect(screen.getByRole('button', { name: 'Pausing…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Stop computer' })).toBeDisabled();
      const composer = screen.getByLabelText('Chat message');
      expect(composer).toBeEnabled();
      fireEvent.change(composer, { target: { value: 'Keep drafting during pause' } });
      fireEvent.keyDown(composer, { key: 'Enter' });
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Paused$/
      )
    );
    expect(screen.getByRole('status', { name: 'Pause notice' })).toHaveTextContent(
      'Computer setup paused.'
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop computer' })).toBeEnabled();
    expect(screen.getByLabelText('Chat message')).toHaveValue('Keep drafting during pause');
    expect(chats()[0].session?.status).toBe('running');
    expect(computerSessionApi.start).toHaveBeenCalledOnce();
  });

  it('labels read-only status checks accurately without offering work cancellation', async () => {
    const id = await computerChatRuntime.create('tenant', 'brand');
    await store
      .getState()
      .save({ ...chats()[0], session: session(id), lastOpenedAt: new Date().toISOString() });
    let finish!: () => void;
    vi.mocked(computerSessionApi.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(session(id));
        })
    );
    mount();
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    try {
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Checking computer…'
      );
      expect(screen.queryByRole('button', { name: 'Pause work' })).toBeNull();
      expect(screen.getByLabelText('Chat message')).toBeEnabled();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
  });

  it('keeps cleanup running without a Pause work control', async () => {
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    const id = chats()[0].id;
    let finish!: () => void;
    vi.mocked(computerSessionApi.stop).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            vi.mocked(computerSessionApi.get).mockResolvedValue(session(id, 'completed'));
            vi.mocked(computerSessionApi.sandboxStopped).mockResolvedValue(true);
            resolve();
          };
        })
    );
    await click('Stop computer');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    try {
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Stopping computer…'
      );
      expect(screen.queryByRole('button', { name: 'Pause work' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Pause setup' })).toBeNull();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Computer ended'
      )
    );
  });
  it('saves preferences per chat, shows policy-off status outside details and restores them when switching', async () => {
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    const first = chats()[0].id;
    await act(async () => store.getState().updateMetadata(first, { title: 'First preferences' }));
    fireEvent.click(screen.getByText('Computer and permissions', { exact: true }));
    fireEvent.change(screen.getByLabelText('Sandbox chat model'), {
      target: { value: 'custom-model' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Check execution policy with NSR' }));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Keep my task' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByText('NSR policy checks off', { exact: true })).toBeNull();
    await click('Save preferences');
    await screen.findByText('Preferences saved for this chat');
    fireEvent.click(screen.getByText('Computer and permissions', { exact: true }));
    expect(screen.getByText('NSR policy checks off', { exact: true })).toBeVisible();
    expect(screen.getByLabelText('Chat message')).toHaveValue('Keep my task');
    await click('New Chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    fireEvent.click(screen.getByText('Computer and permissions', { exact: true }));
    expect(screen.getByLabelText('Sandbox chat model')).toHaveValue('claude-sonnet-4-6');
    expect(screen.getByRole('checkbox', { name: 'Check execution policy with NSR' })).toBeChecked();
    await click(/^First preferences/);
    fireEvent.click(screen.getByText('Computer and permissions', { exact: true }));
    expect(screen.getByLabelText('Sandbox chat model')).toHaveValue('custom-model');
    expect(
      screen.getByRole('checkbox', { name: 'Check execution policy with NSR' })
    ).not.toBeChecked();
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
  });

  it('retains preference edits after a rejected save and blocks invalid or unsaved models without losing the chat draft', async () => {
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    const chat = chats()[0];
    fireEvent.click(screen.getByText('Computer and permissions', { exact: true }));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Retained task' } });
    const model = screen.getByLabelText('Sandbox chat model');
    fireEvent.change(model, { target: { value: '漢'.repeat(86) } });
    expect(model).toHaveAccessibleDescription('Use a model name of at most 255 UTF-8 bytes.');
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' });
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    fireEvent.change(model, { target: { value: 'custom-model' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Check execution policy with NSR' }));
    vi.mocked(window.electronAPI!.store.set).mockImplementation(
      async (key) => key !== 'sandboxChatPreferences'
    );
    screen.getByRole('button', { name: 'Save preferences' }).focus();
    await click('Save preferences');
    await screen.findByText(/Your entries are retained; try saving again/);
    expect(model).toHaveValue('custom-model');
    expect(model).toHaveFocus();
    expect(store.getState().sandboxPreferences[sandboxPreferencesKey(chat)]).toBeUndefined();
    expect(screen.queryByText('NSR policy checks off', { exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByLabelText('Chat message')).toHaveValue('Retained task');
    vi.mocked(window.electronAPI!.store.set).mockResolvedValue(true);
    await click('Save preferences');
    await screen.findByText('Preferences saved for this chat');
    expect(store.getState().sandboxPreferences[sandboxPreferencesKey(chat)]).toEqual({
      model: 'custom-model',
      verify: false,
    });
  });
  it('pages sandbox history and preserves the reader when new output arrives', async () => {
    const id = await computerChatRuntime.create('tenant', 'brand');
    const original = {
      ...chats()[0],
      session: session(id),
      lastOpenedAt: new Date().toISOString(),
      messages: Array.from({ length: 130 }, (_, i) => ({
        id: `message-${i}`,
        role: 'user' as const,
        content: `Saved task ${i}`,
        timestamp: i,
      })),
    };
    await store.getState().save(original);
    mount();
    const transcript = screen.getByRole('region', { name: 'Chat transcript' });
    expect(within(transcript).queryByText('Saved task 0', { exact: true })).toBeNull();
    expect(within(transcript).getByText('Saved task 129', { exact: true })).toBeVisible();
    Object.defineProperties(transcript, {
      scrollHeight: { configurable: true, value: 4000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });
    fireEvent.scroll(transcript);
    await act(async () => {
      await store.getState().save({
        ...original,
        messages: [
          ...original.messages,
          { id: 'new-output', role: 'assistant', content: 'New sandbox result', timestamp: 131 },
        ],
      });
    });
    expect(transcript.scrollTop).toBe(100);
    expect(screen.getByText('1 new message below', { exact: true })).toBeInTheDocument();
    const latest = screen.getByRole('button', { name: 'Jump to latest' });
    latest.focus();
    fireEvent.click(latest);
    expect(transcript.scrollTop).toBe(4000);
    expect(transcript).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Show older messages (31)' }));
    expect(within(transcript).getByText('Saved task 0', { exact: true })).toBeVisible();
    expect(computerSessionApi.create).not.toHaveBeenCalled();
    expect(computerSessionApi.start).not.toHaveBeenCalled();
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
  });
  it('keeps an unsent task and opens connection settings when the NSR key is missing', async () => {
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue(null);
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Keep this task' },
    });
    await click('Send message');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('NSR policy API key'));
    expect(screen.getByLabelText('Chat message')).toHaveValue('Keep this task');
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    await click('Connection settings');
    expect(screen.getByLabelText('NSR policy API key')).toBeVisible();
  });
  it('continues owned provisioning in the background after leaving Chats', async () => {
    let finish!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(true);
        })
    );
    const view = mount();
    await click('New chat');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    view.unmount();
    await act(async () => finish());
    await waitFor(() => expect(computerSessionApi.start).toHaveBeenCalledOnce());
    await waitFor(() => expect(chats()[0].session?.status).toBe('running'));
    await waitFor(() => expect(store.getState().busy[chats()[0].id]).toBe(false));
  });
  it('uses the Sandbox API by default without workflow credentials or diagnostics', async () => {
    const request = vi.fn();
    window.electronAPI!.computerChat = { request } as never;
    mount();
    await click('New chat');
    await waitFor(() => expect(computerSessionApi.start).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    expect(chats()[0].sandboxApiSession).toEqual({ version: 1 });
    expect(chats()[0].session?.currentSandboxId).toBe(`sandbox-${chats()[0].id}`);
    expect(request).not.toHaveBeenCalled();
    expect(chats()[0].durableSession).toBeUndefined();
  });

  it('saves and selects the chat immediately while preparing its computer in the background', async () => {
    let finish!: () => void;
    vi.mocked(computerSessionApi.start).mockImplementationOnce(
      (id) =>
        new Promise((resolve) => {
          finish = () => resolve(session(id));
        })
    );
    mount();
    await click('New chat');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(chats()).toHaveLength(1);
    try {
      expect(await screen.findByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Preparing computer'
      );
      const composer = screen.getByLabelText('Chat message');
      expect(composer).toBeEnabled();
      fireEvent.change(composer, { target: { value: 'Plan my next task' } });
      fireEvent.keyDown(composer, { key: 'Enter' });
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
      expect(computerSessionApi.infer).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'New Chat' })).toBeEnabled();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    expect(screen.getByLabelText('Chat message')).toHaveValue('Plan my next task');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
  });

  it('keeps a next draft editable during inference and requires an explicit send after completion', async () => {
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue({ api_key: 'policy-key' });
    let finish!: () => void;
    vi.mocked(computerSessionApi.infer).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ content: [{ type: 'text', text: 'Finished first task.' }] });
        })
    );
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    const composer = screen.getByLabelText('Chat message');
    fireEvent.change(composer, { target: { value: 'First task' } });
    await click('Send message');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    try {
      expect(composer).toBeEnabled();
      fireEvent.change(composer, { target: { value: 'Next task' } });
      fireEvent.keyDown(composer, { key: 'Enter' });
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
      expect(computerSessionApi.infer).toHaveBeenCalledOnce();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    expect(composer).toHaveValue('Next task');
    expect(chats()[0].messages.filter((message) => message.role === 'user')).toEqual([
      expect.objectContaining({ content: 'First task' }),
    ]);
    expect(computerSessionApi.infer).toHaveBeenCalledOnce();
  });

  it('allocates distinct computers and preserves each chat when switching', async () => {
    mount();
    await click('New chat');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    const first = chats()[0].id;
    await act(async () => store.getState().updateMetadata(first, { title: 'First computer' }));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Keep my draft' } });
    await click('New Chat');
    await waitFor(() => expect(computerSessionApi.start).toHaveBeenCalledTimes(2));
    const second = chats()[0].id;
    expect(chats().find((chat) => chat.id === first)?.session?.currentSandboxId).not.toBe(
      chats()[0].session?.currentSandboxId
    );
    expect(first).not.toBe(second);
    await click(/^First computer/);
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toHaveValue('Keep my draft'));
    expect(computerSessionApi.create).toHaveBeenCalledTimes(2);
  });

  it('shows restored unfinished work without inference or action replay and permits an explicit follow-up', async () => {
    const id = await computerChatRuntime.create('tenant', 'brand');
    await store.getState().save({
      ...chats()[0],
      session: session(id),
      lastOpenedAt: new Date().toISOString(),
      agentTurnUnfinished: true,
      draft: 'Continue my previous task',
      messages: [{ id: 'original-task', role: 'user', content: 'Prepare a report', timestamp: 1 }],
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Work interrupted$/
      )
    );
    expect(screen.getByRole('status', { name: 'Unfinished task' })).toHaveTextContent(
      'Send a follow-up to continue.'
    );
    expect(screen.getByLabelText('Chat message')).toHaveValue('Continue my previous task');
    expect(computerSessionApi.infer).not.toHaveBeenCalled();
    expect(computerSessionApi.create).not.toHaveBeenCalled();
    expect(computerSessionApi.start).not.toHaveBeenCalled();
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
    vi.mocked(computerSessionApi.infer).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Report complete.' }],
    });
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue({ api_key: 'policy-test-key' });
    await click('Send message');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    expect(screen.queryByRole('status', { name: 'Unfinished task' })).toBeNull();
    expect(
      chats()[0]
        .messages.filter((item) => item.role === 'user')
        .map((item) => item.content)
    ).toEqual(['Prepare a report', 'Continue my previous task']);
    expect(chats()[0].agentTurnUnfinished).toBeUndefined();
  });
  it('retains the session identity after a failed start and retries the same session', async () => {
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(
      new SandboxRequestError('Sandbox capacity unavailable', 429)
    );
    vi.mocked(computerSessionApi.get).mockImplementation(async (id) => session(id, 'pending'));
    mount();
    await click('New chat');
    await screen.findByText('Sandbox capacity unavailable');
    const id = chats()[0].session!.id;
    await click('Retry computer setup');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        /^Ready$/
      )
    );
    expect(computerSessionApi.create).toHaveBeenCalledOnce();
    expect(vi.mocked(computerSessionApi.start).mock.calls).toEqual([[id], [id]]);
  });

  it('reveals API key setup without allocating a chat when no key is saved', () => {
    useAuthStore.setState({ sandboxApiKey: null });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.getByRole('region', { name: 'Sandbox connection' })).toBeVisible();
    expect(screen.getByLabelText('Sandbox API key')).toHaveAttribute('type', 'password');
    expect(chats()).toHaveLength(0);
    expect(computerSessionApi.create).not.toHaveBeenCalled();
  });

  it('does not allocate a remote computer when persisting the new chat fails', async () => {
    vi.mocked(window.electronAPI!.store.set).mockResolvedValue(false);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await screen.findAllByRole('alert');
    expect(computerSessionApi.create).not.toHaveBeenCalled();
  });

  it('reopens saved computers with read-only reconciliation and no start or action replay', async () => {
    const id = await computerChatRuntime.create('tenant', 'brand');
    await store.getState().save({
      ...chats()[0],
      session: session(id),
      lastOpenedAt: new Date().toISOString(),
      draft: 'Saved draft',
    });
    mount();
    await waitFor(() => expect(computerSessionApi.get).toHaveBeenCalledWith(id));
    expect(screen.getByLabelText('Chat message')).toHaveValue('Saved draft');
    expect(computerSessionApi.create).not.toHaveBeenCalled();
    expect(computerSessionApi.start).not.toHaveBeenCalled();
    expect(computerSessionApi.execute).not.toHaveBeenCalled();
  });
});

describe('Sandbox empty conversation guidance', () => {
  it.each([
    {
      state: 'ended',
      changes: { stopped: true },
      busy: false,
      message: 'This computer has ended. Your chat is saved. Start a new chat to continue.',
    },
    {
      state: 'shutdown pending',
      changes: { sandboxStopRequested: true },
      busy: false,
      message: 'Computer shutdown is unconfirmed. Your chat and draft are saved.',
    },
    {
      state: 'setup failed',
      changes: { session: undefined, error: 'Capacity unavailable' },
      busy: false,
      message: 'Your chat is saved. Review the setup error above before continuing.',
    },
    {
      state: 'setup interrupted',
      changes: { session: undefined },
      busy: false,
      message: 'Your chat is saved. Check computer setup to continue.',
    },
    {
      state: 'model credits unavailable',
      changes: { error: 'Insufficient credits', errorCode: 'provider-credit' as const },
      busy: false,
      message: 'Your chat is saved. Resolve the issue above before continuing.',
    },
    {
      state: 'checking status after a model error',
      changes: { error: 'Insufficient credits', errorCode: 'provider-credit' as const },
      busy: true,
      message: 'Your chat is saved. Resolve the issue above before continuing.',
    },
    {
      state: 'preparing',
      changes: { session: undefined },
      busy: true,
      message: 'Your chat is saved. Its computer is being prepared in the background.',
    },
  ])('shows accurate guidance when $state', ({ state, changes, busy, message }) => {
    vi.spyOn(computerChatRuntime, 'refresh').mockResolvedValue(undefined);
    const chat: ComputerChat = {
      id: 'empty-chat',
      tenantId: 'tenant',
      brandId: 'brand',
      title: 'Saved chat',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      session: session('empty-chat'),
      messages: [],
      draft: 'Keep my task',
      workflows: [],
      ...changes,
    };
    render(<SandboxConversation chat={chat} busy={busy} onSettings={vi.fn()} />);
    expect(
      within(screen.getByRole('region', { name: 'Chat transcript' })).getByText(message)
    ).toBeVisible();
    expect(screen.getByLabelText('Chat message')).toHaveValue('Keep my task');
    if (changes.stopped || changes.sandboxStopRequested)
      expect(screen.getByLabelText('Chat message')).toBeDisabled();
    else expect(screen.getByLabelText('Chat message')).toBeEnabled();
    if (state === 'model credits unavailable')
      expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    else expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(
      screen.queryByText('Your computer is ready. What would you like to work on?')
    ).toBeNull();
    expect(computerSessionApi.create).not.toHaveBeenCalled();
    expect(computerSessionApi.start).not.toHaveBeenCalled();
  });
});
