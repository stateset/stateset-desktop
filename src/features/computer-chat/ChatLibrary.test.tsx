/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ChatLibrary } from './ChatLibrary';
import { useComputerChatsStore as store } from './store';
import { useAuthStore } from '../../stores/auth';
import { DEFAULT_CHAT_CONFIGURATION } from './durableTypes';
import type { ComputerChat } from './types';
const updateMetadata = store.getState().updateMetadata;
function fixture(): ComputerChat {
  return {
    id: crypto.randomUUID(),
    tenantId: 'tenant',
    brandId: 'brand',
    title: 'October report',
    createdAt: '',
    updatedAt: '',
    messages: [],
    workflows: [],
    session: { id: 'session', organizationId: 'org', status: 'running' },
  };
}
beforeEach(() => {
  store.setState({
    chats: [fixture()],
    busy: {},
    connections: {},
    activities: {},
    persistenceError: undefined,
    loaded: true,
    updateMetadata,
  });
  useAuthStore.setState({ tenant: { id: 'tenant' }, currentBrand: { id: 'brand' } } as never);
  window.electronAPI = {
    store: { set: vi.fn().mockResolvedValue(true) },
  } as unknown as typeof window.electronAPI;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function open() {
  fireEvent.click(screen.getByLabelText('Options for October report'));
}
describe('conversation library controls', () => {
  it('updates live activity without changing the chat or losing search focus and restores saved review', () => {
    const value = {
      ...fixture(),
      sandboxApiSession: { version: 1 as const },
      error: 'Review required',
    };
    store.setState({ chats: [value] });
    const onSelect = vi.fn();
    render(<ChatLibrary onSelect={onSelect} onError={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search conversations' });
    fireEvent.change(search, { target: { value: 'October' } });
    search.focus();
    expect(screen.getByText('Needs attention')).toHaveAttribute('data-tone', 'attention');
    act(() => store.getState().setActivity(value.id, { kind: 'agent', pausing: false }));
    expect(screen.getByText('Working')).toHaveAttribute('data-tone', 'active');
    act(() => store.getState().setActivity(value.id, { kind: 'agent', pausing: true }));
    expect(screen.getByText('Pausing…')).toHaveAttribute('data-tone', 'paused');
    expect(search).toHaveValue('October');
    expect(search).toHaveFocus();
    expect(store.getState().chats[0]).toBe(value);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => store.getState().setActivity(value.id));
    expect(screen.getByText('Needs attention')).toHaveAttribute('data-tone', 'attention');
    expect(search).toHaveFocus();
  });
  it('keeps active agent work out of interrupted-work attention counts until activity ends', () => {
    const value = {
      ...fixture(),
      sandboxApiSession: { version: 1 as const },
      agentTurnUnfinished: true,
    };
    store.setState({ chats: [value] });
    act(() => store.getState().setActivity(value.id, { kind: 'agent', pausing: false }));
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    const filter = screen.getByRole('combobox', { name: 'Filter conversations' });
    fireEvent.change(filter, { target: { value: 'attention' } });
    expect(screen.getByRole('list', { name: 'Saved conversations' })).toBeEmptyDOMElement();
    expect(screen.queryByRole('option', { name: 'Needs attention (1)' })).not.toBeInTheDocument();
    act(() => store.getState().setActivity(value.id));
    expect(screen.getByText('Work interrupted')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Needs attention (1)' })).toBeInTheDocument();
    expect(filter).toHaveValue('attention');
  });
  it('renames a conversation without changing its computer identity', async () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Conversation name'), {
      target: { value: 'Monthly reconciliation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(store.getState().chats[0].title).toBe('Monthly reconciliation'));
    expect(store.getState().chats[0].customTitle).toBe(true);
    expect(store.getState().chats[0].session?.id).toBe('session');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Options for Monthly reconciliation' })
      ).toHaveFocus()
    );
  });
  it('archives and restores a running chat without stopping or removing its session', async () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive chat' }));
    await waitFor(() => expect(screen.queryByText('October report')).not.toBeInTheDocument());
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveFocus();
    expect(store.getState().chats[0].session?.status).toBe('running');
    fireEvent.change(screen.getByLabelText('Filter conversations'), {
      target: { value: 'archived' },
    });
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore chat' }));
    await waitFor(() => expect(store.getState().chats[0].archived).toBe(false));
    expect(store.getState().chats[0].session?.id).toBe('session');
  });
  it('does not offer deletion for a running computer', () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    expect(screen.queryByRole('menuitem', { name: 'Delete saved chat' })).not.toBeInTheDocument();
  });
  it('confirms local deletion of a stopped chat', async () => {
    store.setState({ chats: [{ ...fixture(), stopped: true }] });
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete saved chat' }));
    expect(store.getState().chats).toHaveLength(1);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm chat deletion' })).getByRole('button', {
        name: 'Delete permanently',
      })
    );
    await waitFor(() => expect(store.getState().chats).toHaveLength(0));
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveFocus();
  });
  it('navigates the menu with arrows, endpoints and typeahead, then returns focus on Escape', () => {
    store.setState({ chats: [{ ...fixture(), stopped: true }] });
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Options for October report' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    const menu = screen.getByRole('menu', { name: 'Actions for October report' });
    expect(screen.getByRole('menuitem', { name: 'Delete saved chat' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Delete saved chat' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'p' });
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveFocus();
    parentKeyDown.mockClear();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
  it('closes when focus or a pointer leaves the menu without reclaiming outside focus', () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    const search = screen.getByRole('searchbox', { name: 'Search conversations' });
    act(() => search.focus());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(search).toHaveFocus();
    open();
    fireEvent.pointerDown(search);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('cancels renaming with Escape without bubbling into workspace shortcuts', () => {
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />
      </div>
    );
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Conversation name' });
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: 'Discard this edit' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Conversation name' })).not.toBeInTheDocument();
    expect(store.getState().chats[0].title).toBe('October report');
    expect(screen.getByRole('button', { name: 'Options for October report' })).toHaveFocus();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
  it('focuses the safe deletion choice and cancels without deleting', () => {
    store.setState({ chats: [{ ...fixture(), stopped: true }] });
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete saved chat' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep chat' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Keep chat' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Confirm chat deletion' })).not.toBeInTheDocument();
    expect(store.getState().chats).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Options for October report' })).toHaveFocus();
  });
  it('preserves search and rename text while Escape is used for input composition', () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search conversations' });
    fireEvent.change(search, { target: { value: 'October' } });
    fireEvent.keyDown(search, { key: 'Escape', isComposing: true });
    expect(search).toHaveValue('October');
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const name = screen.getByRole('textbox', { name: 'Conversation name' });
    fireEvent.change(name, { target: { value: 'An unfinished name' } });
    fireEvent.keyDown(name, { key: 'Escape', isComposing: true });
    expect(name).toHaveValue('An unfinished name');
    expect(store.getState().chats[0].title).toBe('October report');
  });
  it('pins without leaving the menu open or changing the active computer', async () => {
    const onSelect = vi.fn();
    render(<ChatLibrary onSelect={onSelect} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(store.getState().chats[0].pinned).toBe(true));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options for October report' })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    expect(store.getState().chats[0].session?.id).toBe('session');
  });
  it('keeps menu commands unavailable until a metadata save is acknowledged', async () => {
    let acknowledge!: (value: boolean) => void;
    vi.mocked(window.electronAPI!.store.set).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        acknowledge = resolve;
      })
    );
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));
    const trigger = screen.getByRole('button', { name: 'Options for October report' });
    // The optimistic value can already be visible while persistence is still pending.
    expect(store.getState().chats[0].pinned).toBe(true);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await act(async () => acknowledge(true));
    await waitFor(() => expect(trigger).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'u' });
    const unpin = screen.getByRole('menuitem', { name: 'Unpin' });
    expect(unpin).toHaveFocus();
    fireEvent.click(unpin);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-disabled', 'false'));
    expect(store.getState().chats[0].pinned).toBe(false);
  });
  it('guards repeated submissions and keeps a failed rename available to retry', async () => {
    let reject!: (error: Error) => void;
    const update = vi.spyOn(store.getState(), 'updateMetadata').mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const onError = vi.fn();
    render(<ChatLibrary onSelect={vi.fn()} onError={onError} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const form = screen.getByRole('form', { name: 'Rename October report' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Conversation name' }), {
      key: 'Escape',
    });
    expect(form).toBeInTheDocument();
    reject(new Error('Storage unavailable'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Storage unavailable'));
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Conversation name' })).toBeInTheDocument();
  });
  it('does not pull focus back after a pending rename when the user moved elsewhere', async () => {
    let finish!: () => void;
    vi.spyOn(store.getState(), 'updateMetadata').mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    const search = screen.getByRole('searchbox', { name: 'Search conversations' });
    act(() => search.focus());
    finish();
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Conversation name' })).not.toBeInTheDocument()
    );
    expect(search).toHaveFocus();
  });
  it('returns focus to search when renaming removes a row from the current search', async () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), {
      target: { value: 'October' },
    });
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation name' }), {
      target: { value: 'Monthly report' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(store.getState().chats[0].title).toBe('Monthly report'));
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveFocus();
    expect(screen.getByText('No conversations match your search.')).toBeInTheDocument();
  });
});

it('counts only scoped nonarchived attention states and displays their reason', () => {
  const own = {
    ...fixture(),
    durableSession: {
      version: 2 as const,
      workflowId: 'workflow',
      engineUrl: 'https://engine.example',
      configuration: DEFAULT_CHAT_CONFIGURATION,
    },
    pendingMessage: { id: 'm', content: 'Unconfirmed instruction' },
  };
  store.setState({
    chats: [
      own,
      { ...fixture(), id: 'foreign', brandId: 'other', error: 'Foreign failure' },
      { ...fixture(), id: 'archived', archived: true, error: 'Archived failure' },
    ],
  });
  render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
  expect(screen.getByText('Message unconfirmed')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Needs attention (1)' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter conversations' }), {
    target: { value: 'attention' },
  });
  expect(
    within(screen.getByRole('list', { name: 'Saved conversations' })).getAllByRole('listitem')
  ).toHaveLength(1);
});
