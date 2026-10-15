/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { WorkspaceCommandPalette } from './WorkspaceCommandPalette';
import { useComputerChatsStore } from './store';
import { useAuthStore } from '../../stores/auth';
import { DEFAULT_CHAT_CONFIGURATION } from './durableTypes';
import type { ComputerChat } from './types';
import type { CommandPaletteChat } from '../../components/CommandPalette';

vi.mock('../../components/CommandPalette', () => ({
  CommandPalette: ({ chats }: { chats: CommandPaletteChat[] }) => (
    <ul>
      {chats.map((chat) => (
        <li key={chat.id}>
          {chat.title} · {chat.status}
        </li>
      ))}
    </ul>
  ),
}));
const chat = (id: string, patch: Partial<ComputerChat> = {}): ComputerChat => ({
  id,
  tenantId: 'tenant',
  brandId: 'brand',
  title: id,
  messages: [],
  workflows: [],
  createdAt: '',
  updatedAt: '',
  ...patch,
});
beforeEach(() => {
  useAuthStore.setState({ tenant: { id: 'tenant' }, currentBrand: { id: 'brand' } } as never);
  useComputerChatsStore.setState({
    connections: {},
    chats: [
      chat('Pinned conversation', { pinned: true }),
      chat('Archived conversation', { archived: true, stopped: true }),
      chat('Other organization', { tenantId: 'different' }),
      chat('Other brand', { brandId: 'different' }),
    ],
  });
});
afterEach(cleanup);
describe('workspace conversation commands', () => {
  it('provides only scoped summaries, including archived chats, and follows brand changes', () => {
    render(<WorkspaceCommandPalette isOpen onClose={vi.fn()} />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Pinned conversation · Previous local session',
      'Archived conversation · Computer ended',
    ]);
    expect(screen.queryByText(/Other organization/)).not.toBeInTheDocument();
    act(() => useAuthStore.setState({ currentBrand: { id: 'different' } } as never));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Other brand · Previous local session',
    ]);
  });
  it('does not forward private conversation summaries while closed', () => {
    render(<WorkspaceCommandPalette isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

it('updates status summaries when a connection needs attention', () => {
  useComputerChatsStore.setState({
    chats: [
      chat('Report', {
        durableSession: {
          version: 2,
          workflowId: 'workflow',
          engineUrl: 'https://engine.example',
          configuration: DEFAULT_CHAT_CONFIGURATION,
        },
      } as Partial<ComputerChat>),
    ],
  });
  render(<WorkspaceCommandPalette isOpen onClose={vi.fn()} />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Report · Connecting');
  act(() =>
    useComputerChatsStore.getState().setConnection('Report', { status: 'attention', failures: 1 })
  );
  expect(screen.getByRole('listitem')).toHaveTextContent('Report · Connection needs attention');
});
