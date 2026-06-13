/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from './SessionList';
import { makeSession } from '../testing/fixtures';
import type { AgentSession } from '../../../types';

function renderList(overrides: Partial<React.ComponentProps<typeof SessionList>> = {}) {
  const sessions = overrides.filteredSessions ?? [
    makeSession({ id: 'sess-a', name: 'Alpha Agent', status: 'running' }),
    makeSession({ id: 'sess-b', name: 'Beta Agent', status: 'stopped' }),
  ];
  const props: React.ComponentProps<typeof SessionList> = {
    isLoading: false,
    totalCount: sessions.length,
    filteredSessions: sessions,
    paginatedSessions: sessions,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    selectedIds: new Set<string>(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onCreate: vi.fn(),
    onClearFilters: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRowClick: vi.fn(),
    onCopy: vi.fn(),
    onExportSummary: vi.fn(),
    onRename: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
  render(<SessionList {...props} />);
  return props;
}

describe('SessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeletons while sessions load', () => {
    renderList({ isLoading: true });
    expect(screen.getByRole('status', { name: 'Loading sessions' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Agent sessions' })).not.toBeInTheDocument();
  });

  it('shows the onboarding empty state when there are no sessions at all', () => {
    const props = renderList({
      totalCount: 0,
      filteredSessions: [],
      paginatedSessions: [],
    });
    expect(screen.getByText('Launch your first agent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }));
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('shows the no-matches empty state when filters exclude everything', () => {
    const props = renderList({
      totalCount: 3,
      filteredSessions: [],
      paginatedSessions: [],
    });
    expect(screen.getByText('No matching agents')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it('renders a row per paginated session with list semantics', () => {
    renderList();
    const list = screen.getByRole('list', { name: 'Agent sessions' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
    expect(screen.getByText('Beta Agent')).toBeInTheDocument();
  });

  it('navigates when a row is clicked', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: /Alpha Agent, status: Running/ }));
    expect(props.onRowClick).toHaveBeenCalledWith('sess-a');
  });

  it('toggles row selection', () => {
    const props = renderList();
    fireEvent.click(screen.getByLabelText('Select Alpha Agent'));
    expect(props.onToggleSelect).toHaveBeenCalledWith('sess-a');
  });

  it('shows pagination when there are multiple pages', () => {
    const sessions: AgentSession[] = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: `sess-${i}`, name: `Agent ${i}` })
    );
    renderList({
      totalCount: 25,
      filteredSessions: sessions,
      paginatedSessions: sessions.slice(0, 10),
      totalPages: 3,
    });
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);
  });
});
