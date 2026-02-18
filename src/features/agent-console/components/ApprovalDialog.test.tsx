/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApprovalDialog } from './ApprovalDialog';
import type { PendingApproval } from '../../../hooks/useAgentStream';

function makeApproval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    sessionId: 'session-1',
    reason: 'budget_warning',
    details: { percentUsed: 85 },
    ...overrides,
  };
}

describe('ApprovalDialog', () => {
  const defaults = {
    onApprove: vi.fn().mockResolvedValue(undefined),
    onDeny: vi.fn().mockResolvedValue(undefined),
  };

  it('renders approval reason and budget progress', () => {
    render(<ApprovalDialog approval={makeApproval()} {...defaults} />);

    expect(screen.getByText('Approval Required')).toBeInTheDocument();
    expect(screen.getByText('Budget Warning')).toBeInTheDocument();
    expect(screen.getByText('Budget used: 85%')).toBeInTheDocument();
  });

  it('renders custom reason as-is when not budget_warning', () => {
    render(
      <ApprovalDialog
        approval={makeApproval({ reason: 'dangerous_tool', details: {} })}
        {...defaults}
      />
    );

    expect(screen.getByText('dangerous_tool')).toBeInTheDocument();
  });

  it('calls onApprove when Approve button clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <ApprovalDialog approval={makeApproval()} onApprove={onApprove} onDeny={defaults.onDeny} />
    );

    fireEvent.click(screen.getByText('Approve & Continue'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
  });

  it('calls onDeny when Deny button clicked', async () => {
    const onDeny = vi.fn().mockResolvedValue(undefined);
    render(
      <ApprovalDialog approval={makeApproval()} onApprove={defaults.onApprove} onDeny={onDeny} />
    );

    fireEvent.click(screen.getByText('Deny'));
    await waitFor(() => expect(onDeny).toHaveBeenCalledOnce());
  });

  it('disables buttons during loading', async () => {
    let resolveApprove: () => void;
    const onApprove = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveApprove = r;
        })
    );

    render(
      <ApprovalDialog approval={makeApproval()} onApprove={onApprove} onDeny={defaults.onDeny} />
    );

    fireEvent.click(screen.getByText('Approve & Continue'));

    // Both buttons should be disabled while the promise is pending
    await waitFor(() => {
      const buttons = screen
        .getAllByRole('button')
        .filter((b) => b.textContent === 'Deny' || b.textContent?.includes('Approve'));
      buttons.forEach((btn) => expect(btn).toBeDisabled());
    });

    // Resolve to clean up
    resolveApprove!();
  });

  it('does not render progress bar when percentUsed is absent', () => {
    render(<ApprovalDialog approval={makeApproval({ details: {} })} {...defaults} />);

    expect(screen.queryByText(/Budget used/)).not.toBeInTheDocument();
  });
});
