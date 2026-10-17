/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchActionNotice } from './BatchActionNotice';
import { makeSession } from '../testing/fixtures';
import type { BatchResult } from '../utils/sessionActions';

function renderNotice(result: BatchResult | null = null, extra = {}) {
  const props = {
    progress: null,
    result,
    isBusy: false,
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    ...extra,
  };
  render(<BatchActionNotice {...props} />);
  return props;
}
describe('BatchActionNotice', () => {
  it('stays absent before an action has run', () => {
    const { container } = render(
      <BatchActionNotice
        progress={null}
        result={null}
        isBusy={false}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
  it('announces incremental progress and the final refresh', () => {
    const props = {
      progress: { action: 'stop' as const, completed: 1, total: 3 },
      result: null,
      isBusy: true,
      onRetry: vi.fn(),
      onDismiss: vi.fn(),
    };
    const { rerender } = render(<BatchActionNotice {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Stopping agents');
    expect(screen.getByRole('progressbar', { name: 'Stopping agents' })).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    rerender(<BatchActionNotice {...props} progress={{ ...props.progress, completed: 3 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing agent list…');
  });
  it('keeps failed names available and exposes retry and dismiss', () => {
    const props = renderNotice({
      action: 'start',
      total: 2,
      succeeded: 1,
      failed: [makeSession({ name: 'Needs attention' })],
      skipped: 0,
    });
    expect(screen.getByText('1 started; 1 failed to start.')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss action result' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.onDismiss).toHaveBeenCalledOnce();
  });
  it('requires cleanup review instead of immediately offering a delete retry', () => {
    renderNotice({ action: 'delete', total: 1, succeeded: 0, failed: [makeSession()], skipped: 0 });
    expect(screen.getByRole('button', { name: 'Review cleanup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
  });
  it('reports skipped targets without labeling them as failed requests', () => {
    renderNotice({ action: 'stop', total: 2, succeeded: 1, failed: [], skipped: 1 });
    expect(
      screen.getByText(/1 not attempted because the workspace or agent status changed/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
  it('does not offer retries after complete success', () => {
    renderNotice({ action: 'stop', total: 1, succeeded: 1, failed: [], skipped: 0 });
    expect(screen.getByText('1 agent stopped.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
  });
  it('does not show previous-workspace names or counts while that request finishes', () => {
    renderNotice(
      {
        action: 'start',
        total: 2,
        succeeded: 1,
        failed: [makeSession({ name: 'Previous workspace agent' })],
        skipped: 0,
      },
      { isBusy: true, previousWorkspace: true }
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Finishing the previous workspace action…'
    );
    expect(screen.queryByText('Previous workspace agent')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
