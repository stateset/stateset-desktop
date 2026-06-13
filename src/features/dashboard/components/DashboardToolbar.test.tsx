/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { DashboardToolbar } from './DashboardToolbar';
import type { StatusFilter } from '../utils/sessionFilters';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof DashboardToolbar>> = {}) {
  const props = {
    searchQuery: '',
    statusFilter: 'all' as StatusFilter,
    allTags: [] as string[],
    selectedTags: new Set<string>(),
    runningCount: 2,
    stoppedCount: 1,
    sessionsCount: 3,
    filteredCount: 3,
    hasActiveFilters: false,
    isStartingAll: false,
    isStoppingAll: false,
    isDeletingStopped: false,
    searchInputRef: createRef<HTMLInputElement>(),
    onSearchChange: vi.fn(),
    onStatusFilterChange: vi.fn(),
    onToggleTag: vi.fn(),
    onClearTags: vi.fn(),
    onStartAll: vi.fn(),
    onStopAll: vi.fn(),
    onDeleteStopped: vi.fn(),
    onExportJSON: vi.fn(),
    onExportCSV: vi.fn(),
    onExportMetrics: vi.fn(),
    ...overrides,
  };
  render(<DashboardToolbar {...props} />);
  return props;
}

describe('DashboardToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the total session count when no filters are active', () => {
    renderToolbar({ sessionsCount: 5, filteredCount: 5 });
    expect(screen.getByText('Agent Sessions')).toBeInTheDocument();
    expect(screen.getByText('5 total')).toBeInTheDocument();
  });

  it('shows "x of y" when filters are active', () => {
    renderToolbar({ sessionsCount: 5, filteredCount: 2, hasActiveFilters: true });
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('propagates search input changes', () => {
    const props = renderToolbar();
    fireEvent.change(screen.getByLabelText('Search agents'), { target: { value: 'sup' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('sup');
  });

  it('shows a clear button when search has text', () => {
    const props = renderToolbar({ searchQuery: 'abc' });
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(props.onSearchChange).toHaveBeenCalledWith('');
  });

  it('renders status filter pills and marks the active one', () => {
    const props = renderToolbar({ statusFilter: 'running' });
    const runningPill = screen.getByRole('button', { name: 'Running', pressed: true });
    expect(runningPill).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith('failed');
  });

  it('invokes bulk actions', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /start all/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop all/i }));
    fireEvent.click(screen.getByRole('button', { name: /clean up/i }));
    expect(props.onStartAll).toHaveBeenCalled();
    expect(props.onStopAll).toHaveBeenCalled();
    expect(props.onDeleteStopped).toHaveBeenCalled();
  });

  it('disables Start All / Clean Up when nothing is stopped', () => {
    renderToolbar({ stoppedCount: 0 });
    expect(screen.getByRole('button', { name: /start all/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /clean up/i })).toBeDisabled();
  });

  it('disables Stop All when nothing is running', () => {
    renderToolbar({ runningCount: 0 });
    expect(screen.getByRole('button', { name: /stop all/i })).toBeDisabled();
  });

  it('announces in-flight bulk operations politely', () => {
    renderToolbar({ isStartingAll: true });
    expect(screen.getByText('Starting all agents')).toBeInTheDocument();
  });

  it('opens the export menu and fires export callbacks', () => {
    const props = renderToolbar();
    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(exportButton);
    expect(exportButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('menuitem', { name: /json/i }));
    expect(props.onExportJSON).toHaveBeenCalled();

    // Menu closes after selecting an option
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('fires the CSV export callback', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /csv/i }));
    expect(props.onExportCSV).toHaveBeenCalled();
  });

  it('fires the metrics export callback', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /metrics summary/i }));
    expect(props.onExportMetrics).toHaveBeenCalled();
  });

  it('closes the export menu on Escape', () => {
    renderToolbar();
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    expect(exportButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables export when there are no sessions', () => {
    renderToolbar({ sessionsCount: 0, filteredCount: 0 });
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('renders tag filters and clear-tags button when tags are selected', () => {
    const props = renderToolbar({
      allTags: ['dev', 'prod'],
      selectedTags: new Set(['prod']),
    });
    expect(screen.getByText('Tags')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear selected tags'));
    expect(props.onClearTags).toHaveBeenCalled();
  });
});
