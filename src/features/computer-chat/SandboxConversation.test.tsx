/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableComputerChat } from './DurableComputerChat';
import { useComputerChatsStore as store } from './store';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { computerSessionApi } from './api';
import { computerChatRuntime } from './runtime';
import { SandboxRequestError } from '../../lib/sandbox';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  computerSessionApi: {
    create: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    stop: vi.fn(),
    sandboxStopped: vi.fn(),
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
beforeEach(() => {
  vi.resetAllMocks();
  window.electronAPI = { store: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) } } as never;
  store.setState({
    chats: [],
    loaded: true,
    busy: {},
    connections: {},
    configurations: {},
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
  it('continues owned provisioning in the background after leaving Chats', async () => {
    let finish!: () => void;
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(true);
        })
    );
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(computerSessionApi.start).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toBeEnabled());
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
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(chats()).toHaveLength(1);
    try {
      expect(await screen.findByRole('status', { name: 'Conversation status' })).toHaveTextContent(
        'Preparing computer'
      );
      expect(screen.getByLabelText('Chat message')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'New Chat' })).toBeEnabled();
    } finally {
      await act(async () => finish());
    }
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toBeEnabled());
  });

  it('allocates distinct computers and preserves each chat when switching', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toBeEnabled());
    const first = chats()[0].id;
    await act(async () => store.getState().updateMetadata(first, { title: 'First computer' }));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Keep my draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    await waitFor(() => expect(computerSessionApi.start).toHaveBeenCalledTimes(2));
    const second = chats()[0].id;
    expect(chats().find((chat) => chat.id === first)?.session?.currentSandboxId).not.toBe(
      chats()[0].session?.currentSandboxId
    );
    expect(first).not.toBe(second);
    fireEvent.click(screen.getByRole('button', { name: /^First computer/ }));
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toHaveValue('Keep my draft'));
    expect(computerSessionApi.create).toHaveBeenCalledTimes(2);
  });

  it('retains the session identity after a failed start and retries the same session', async () => {
    vi.mocked(computerSessionApi.start).mockRejectedValueOnce(
      new SandboxRequestError('Sandbox capacity unavailable', 429)
    );
    vi.mocked(computerSessionApi.get).mockImplementation(async (id) => session(id, 'pending'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await screen.findByText('Sandbox capacity unavailable');
    const id = chats()[0].session!.id;
    fireEvent.click(screen.getByRole('button', { name: 'Retry computer setup' }));
    await waitFor(() => expect(screen.getByLabelText('Chat message')).toBeEnabled());
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
