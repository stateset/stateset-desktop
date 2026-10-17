/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowInitializationNotice } from './WorkflowInitializationNotice';
import { useDurableWorkflowsStore as workflows } from '../stores/durableWorkflows';

const initialize = workflows.getState().initialize;
afterEach(() => {
  cleanup();
  workflows.setState({ initialize, initialized: true, initializationError: null });
});
describe('saved workflow settings recovery notice', () => {
  it('announces loading and permits one explicit retry after a failed read', async () => {
    let finish!: () => void;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            workflows.setState({ initialized: true, initializationError: null });
            resolve();
          };
        })
    );
    workflows.setState({ initialized: false, initializationError: null, initialize: retry });
    render(<WorkflowInitializationNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved workflow settings');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() =>
      workflows.setState({
        initializationError: 'Saved workflow settings could not be loaded. Retry to reconnect.',
      })
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    const button = screen.getByRole('button', { name: 'Retry loading settings' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
    await act(async () => finish());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
