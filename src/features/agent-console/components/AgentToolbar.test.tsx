/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentToolbar } from './AgentToolbar';

function makeProps(overrides: Partial<Parameters<typeof AgentToolbar>[0]> = {}) {
  return {
    session: { id: 'session-1', agent_type: 'support', name: null, config: { model: 'x' } },
    isConnected: true,
    isConnecting: false,
    isRunning: false,
    isPaused: false,
    isStopped: true,
    isCloning: false,
    isPausing: false,
    isStopping: false,
    showSearch: false,
    showLogs: false,
    showStartStreamCta: false,
    isStartStreamPending: false,
    startStreamLabel: 'Start Agent',
    onBack: vi.fn(),
    onToggleSearch: vi.fn(),
    onExport: vi.fn(),
    onClone: vi.fn(),
    onSaveTemplate: vi.fn(),
    onToggleLogs: vi.fn(),
    onOpenConfig: vi.fn(),
    onStartAndStream: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe('AgentToolbar', () => {
  it('derives the title from the agent type when no name is set', () => {
    render(<AgentToolbar {...makeProps()} />);
    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('uses the session name when present and includes the agent type in the subtitle', () => {
    render(
      <AgentToolbar
        {...makeProps({
          session: { id: 's', agent_type: 'support', name: 'Refund Bot', config: {} },
        })}
      />
    );
    expect(screen.getByText('Refund Bot')).toBeInTheDocument();
    expect(screen.getByText(/Support • Connected/)).toBeInTheDocument();
  });

  it('shows connecting and disconnected states', () => {
    const { rerender } = render(
      <AgentToolbar {...makeProps({ isConnected: false, isConnecting: true })} />
    );
    expect(screen.getByText('Connecting...')).toBeInTheDocument();

    rerender(<AgentToolbar {...makeProps({ isConnected: false, isConnecting: false })} />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('invokes navigation and panel callbacks', () => {
    const props = makeProps();
    render(<AgentToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Search in conversation' }));
    expect(props.onToggleSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle logs panel' }));
    expect(props.onToggleLogs).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(props.onOpenConfig).toHaveBeenCalledTimes(1);
  });

  it('reflects toggle state with aria-pressed', () => {
    render(<AgentToolbar {...makeProps({ showSearch: true, showLogs: false })} />);
    expect(screen.getByRole('button', { name: 'Search in conversation' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Toggle logs panel' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('invokes export, clone and save-template callbacks', () => {
    const props = makeProps();
    render(<AgentToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export conversation' }));
    expect(props.onExport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clone agent' }));
    expect(props.onClone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    expect(props.onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it('disables clone and save-template without a session config', () => {
    render(
      <AgentToolbar
        {...makeProps({
          session: { id: 's', agent_type: 'support', name: null, config: undefined },
        })}
      />
    );
    expect(screen.getByRole('button', { name: 'Clone agent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as template' })).toBeDisabled();
  });

  it('disables clone while cloning', () => {
    render(<AgentToolbar {...makeProps({ isCloning: true })} />);
    expect(screen.getByRole('button', { name: 'Clone agent' })).toBeDisabled();
  });

  it('shows the start CTA only when requested', () => {
    const props = makeProps({ showStartStreamCta: true, startStreamLabel: 'Start & Stream' });
    render(<AgentToolbar {...props} />);

    const start = screen.getByText('Start & Stream').closest('button') as HTMLButtonElement;
    fireEvent.click(start);
    expect(props.onStartAndStream).toHaveBeenCalledTimes(1);
  });

  it('disables the start CTA while pending', () => {
    render(
      <AgentToolbar {...makeProps({ showStartStreamCta: true, isStartStreamPending: true })} />
    );
    // Label text is hidden while pending button shows a spinner; find via the visible Start span
    const start = screen.getByText('Start').closest('button') as HTMLButtonElement;
    expect(start).toBeDisabled();
  });

  it('hides start, pause and stop controls when stopped', () => {
    render(<AgentToolbar {...makeProps()} />);
    expect(screen.queryByRole('button', { name: 'Pause agent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop agent' })).not.toBeInTheDocument();
  });

  it('shows pause and stop while running', () => {
    const props = makeProps({ isRunning: true, isStopped: false });
    render(<AgentToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause agent' }));
    expect(props.onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it('shows stop but not pause while paused', () => {
    render(<AgentToolbar {...makeProps({ isPaused: true, isStopped: false })} />);
    expect(screen.queryByRole('button', { name: 'Pause agent' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop agent' })).toBeInTheDocument();
  });

  it('opens the overflow menu and forwards its actions', () => {
    const props = makeProps();
    render(<AgentToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('Clone Agent')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clone Agent'));
    expect(props.onClone).toHaveBeenCalledTimes(1);
    // Menu closes after an action
    expect(screen.queryByText('Clone Agent')).not.toBeInTheDocument();
  });
});
