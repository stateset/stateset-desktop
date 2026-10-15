/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ChatLibrary } from './ChatLibrary';
import { useComputerChatsStore as store } from './store';
import { useAuthStore } from '../../stores/auth';
import { DEFAULT_CHAT_CONFIGURATION } from './durableTypes';
import type { ComputerChat } from './types';
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
    persistenceError: undefined,
    loaded: true,
  });
  useAuthStore.setState({ tenant: { id: 'tenant' }, currentBrand: { id: 'brand' } } as never);
  window.electronAPI = {
    store: { set: vi.fn().mockResolvedValue(true) },
  } as unknown as typeof window.electronAPI;
});
afterEach(cleanup);
function open() {
  fireEvent.click(screen.getByLabelText('Options for October report'));
}
describe('conversation library controls', () => {
  it('renames a conversation without changing its computer identity', async () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Conversation name'), {
      target: { value: 'Monthly reconciliation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(store.getState().chats[0].title).toBe('Monthly reconciliation'));
    expect(store.getState().chats[0].customTitle).toBe(true);
    expect(store.getState().chats[0].session?.id).toBe('session');
  });
  it('archives and restores a running chat without stopping or removing its session', async () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Archive chat' }));
    await waitFor(() => expect(screen.queryByText('October report')).not.toBeInTheDocument());
    expect(store.getState().chats[0].session?.status).toBe('running');
    fireEvent.change(screen.getByLabelText('Filter conversations'), {
      target: { value: 'archived' },
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Restore chat' }));
    await waitFor(() => expect(store.getState().chats[0].archived).toBe(false));
    expect(store.getState().chats[0].session?.id).toBe('session');
  });
  it('does not offer deletion for a running computer', () => {
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    expect(screen.queryByRole('button', { name: 'Delete saved chat' })).not.toBeInTheDocument();
  });
  it('confirms local deletion of a stopped chat', async () => {
    store.setState({ chats: [{ ...fixture(), stopped: true }] });
    render(<ChatLibrary onSelect={vi.fn()} onError={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved chat' }));
    expect(store.getState().chats).toHaveLength(1);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm chat deletion' })).getByRole('button', {
        name: 'Delete permanently',
      })
    );
    await waitFor(() => expect(store.getState().chats).toHaveLength(0));
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
