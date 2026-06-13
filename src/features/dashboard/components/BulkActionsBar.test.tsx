/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionsBar } from './BulkActionsBar';
import { makeSession } from '../testing/fixtures';
import type { AgentSession } from '../../../types';

function renderBar(
  overrides: Partial<React.ComponentProps<typeof BulkActionsBar>> = {},
  sessions?: AgentSession[]
) {
  const defaultSessions = sessions ?? [
    makeSession({ id: 'run-1', status: 'running' }),
    makeSession({ id: 'stop-1', status: 'stopped' }),
  ];
  const props = {
    sessions: defaultSessions,
    selectedIds: new Set(['run-1', 'stop-1']),
    visibleCount: 2,
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onBulkStart: vi.fn(),
    onBulkStop: vi.fn(),
    ...overrides,
  };
  render(<BulkActionsBar {...props} />);
  return props;
}

describe('BulkActionsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no sessions are selected', () => {
    renderBar({ selectedIds: new Set() });
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('shows the selected count', () => {
    renderBar();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('checks the select-all checkbox when every visible session is selected', () => {
    renderBar();
    expect(screen.getByLabelText('Select all visible agents')).toBeChecked();
  });

  it('fires onSelectAll when the checkbox is toggled', () => {
    const props = renderBar();
    fireEvent.click(screen.getByLabelText('Select all visible agents'));
    expect(props.onSelectAll).toHaveBeenCalled();
  });

  it('clears the selection', () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(props.onClearSelection).toHaveBeenCalled();
  });

  it('enables Start Selected only when a stopped/failed session is selected', () => {
    const props = renderBar();
    const startButton = screen.getByRole('button', { name: /start selected/i });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);
    expect(props.onBulkStart).toHaveBeenCalled();
  });

  it('disables Start Selected when only running sessions are selected', () => {
    renderBar({ selectedIds: new Set(['run-1']), visibleCount: 2 });
    expect(screen.getByRole('button', { name: /start selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /stop selected/i })).toBeEnabled();
  });

  it('disables Stop Selected when only stopped sessions are selected', () => {
    const props = renderBar({ selectedIds: new Set(['stop-1']), visibleCount: 2 });
    expect(screen.getByRole('button', { name: /stop selected/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /start selected/i }));
    expect(props.onBulkStart).toHaveBeenCalled();
  });
});
