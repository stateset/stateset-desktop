/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardHeader } from './DashboardHeader';

function renderHeader(overrides: Partial<React.ComponentProps<typeof DashboardHeader>> = {}) {
  const props = {
    greeting: 'Good morning',
    sessionsCount: 0,
    runningCount: 0,
    isLoading: false,
    isOnline: true,
    isCreating: false,
    canCreate: true,
    onOpenCommandPalette: vi.fn(),
    onRefresh: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<DashboardHeader {...props} />);
  return props;
}

describe('DashboardHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the greeting', () => {
    renderHeader({ greeting: 'Good evening' });
    expect(screen.getByRole('heading', { name: 'Good evening' })).toBeInTheDocument();
  });

  it('shows the generic subtitle when there are no sessions', () => {
    renderHeader();
    expect(screen.getByText('Manage your autonomous AI agents')).toBeInTheDocument();
  });

  it('summarizes running and idle agents', () => {
    renderHeader({ sessionsCount: 5, runningCount: 2 });
    expect(screen.getByText('2 agents running')).toBeInTheDocument();
    expect(screen.getByText('3 idle')).toBeInTheDocument();
  });

  it('uses singular wording for one running agent', () => {
    renderHeader({ sessionsCount: 1, runningCount: 1 });
    expect(screen.getByText('1 agent running')).toBeInTheDocument();
  });

  it('shows "No agents running" when sessions exist but none run', () => {
    renderHeader({ sessionsCount: 3, runningCount: 0 });
    expect(screen.getByText('No agents running')).toBeInTheDocument();
  });

  it('shows the offline badge when offline', () => {
    renderHeader({ isOnline: false });
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('hides the offline badge when online', () => {
    renderHeader({ isOnline: true });
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('fires the action callbacks', () => {
    const props = renderHeader();
    fireEvent.click(screen.getByLabelText('Open command palette'));
    fireEvent.click(screen.getByLabelText('Refresh sessions'));
    fireEvent.click(screen.getByLabelText('Create new agent'));
    expect(props.onOpenCommandPalette).toHaveBeenCalled();
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('disables creation when no brand is selected', () => {
    renderHeader({ canCreate: false });
    expect(screen.getByLabelText('Create new agent')).toBeDisabled();
  });

  it('disables creation while a session is being created', () => {
    renderHeader({ isCreating: true });
    expect(screen.getByLabelText('Create new agent')).toBeDisabled();
  });
});
