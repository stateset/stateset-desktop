/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalCard } from './ApprovalCard';
import { APPROVAL_DURATION_MS, approvalVersion } from './approvals';
import { durableChatController } from './durable';
import { useComputerChatsStore } from './store';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import type { ComputerChat } from './types';

vi.mock('./durable', () => ({ durableChatController: { review: vi.fn(), refresh: vi.fn() } }));
const start = 1_800_000_000_000;
function fixture(verdict = 'ask_user'): ComputerChat {
  return {
    id: 'chat',
    durableSession: { workflowId: 'workflow', engineUrl: 'https://engine.example' },
    serverState: {
      status: 'awaiting_approval',
      pending_action: {
        request_id: 'action',
        name: 'execute',
        command: ['python3', 'report.py'],
        arguments: {},
        review_started_ms: start,
        result_available: false,
        rewritten: false,
        admission: {
          final_verdict: verdict,
          evidence_ids: ['evidence-1'],
          evaluation: {
            canonical_action_hash: 'hash',
            rewritten_action: { type: 'execute_command', command: ['python3', 'safe.py'] },
            triggered_rules: [{ reason: 'Confirm access to the report.' }],
          },
        },
      },
    },
  } as unknown as ComputerChat;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  useComputerChatsStore.setState({ connections: { chat: { status: 'connected', failures: 0 } } });
  useDurableWorkflowsStore.setState({ engineUrl: 'https://engine.example' });
  vi.mocked(durableChatController.review).mockResolvedValue();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe('action review', () => {
  it('exposes a stable accessible deadline without announcing countdown updates', () => {
    render(<ApprovalCard chat={fixture()} busy={false} />);
    const deadline = screen.getByText(/^Approval deadline:/);
    expect(deadline).toHaveAttribute(
      'datetime',
      new Date(start + APPROVAL_DURATION_MS).toISOString()
    );
    const text = deadline.textContent;
    act(() => vi.advanceTimersByTime(1000));
    expect(deadline.textContent).toBe(text);
    expect(screen.getByText('Expires in 9:59')).toHaveAttribute('aria-hidden', 'true');
  });
  it('moves from an expiring focused control to the refresh action', () => {
    render(<ApprovalCard chat={fixture()} busy={false} />);
    act(() => screen.getByRole('button', { name: 'Approve action' }).focus());
    act(() => vi.advanceTimersByTime(APPROVAL_DURATION_MS));
    expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveFocus();
  });
  it('leaves another control focused when the approval expires in the background', () => {
    render(
      <>
        <button type="button">Other task</button>
        <ApprovalCard chat={fixture()} busy={false} />
      </>
    );
    const other = screen.getByRole('button', { name: 'Other task' });
    act(() => other.focus());
    act(() => vi.advanceTimersByTime(APPROVAL_DURATION_MS));
    expect(other).toHaveFocus();
  });
  it('focuses the explanation if a focused review goes offline', () => {
    render(<ApprovalCard chat={fixture()} busy={false} />);
    act(() => screen.getByRole('button', { name: 'Approve action' }).focus());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('status')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Reconnect');
  });
  it('binds explicit replacement consent to the complete displayed action', async () => {
    const chat = fixture('rewrite');
    render(<ApprovalCard chat={chat} busy={false} />);
    const approve = screen.getByRole('button', { name: 'Accept replacement' });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(durableChatController.review).toHaveBeenCalledWith(
      'chat',
      approvalVersion(chat),
      true,
      true
    );
  });
  it('resets consent when the replacement changes with the same request ID and hash', () => {
    const chat = fixture('rewrite');
    const { rerender } = render(<ApprovalCard chat={chat} busy={false} />);
    fireEvent.click(screen.getByRole('checkbox'));
    const changed = structuredClone(chat);
    changed.serverState!.pending_action!.admission!.evaluation.rewritten_action = {
      type: 'execute_command',
      command: ['python3', 'other.py'],
    };
    rerender(<ApprovalCard chat={changed} busy={false} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Accept replacement' })).toBeDisabled();
  });
  it('expires at the deadline, stops countdown updates, and refreshes without sending a review', async () => {
    render(<ApprovalCard chat={fixture()} busy={false} />);
    expect(screen.getByText('Expires in 10:00')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(APPROVAL_DURATION_MS));
    expect(screen.getByRole('status')).toHaveTextContent('expired');
    expect(screen.getByRole('button', { name: 'Approve action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject action' })).toBeDisabled();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    });
    expect(durableChatController.refresh).toHaveBeenCalledWith('chat');
    expect(durableChatController.review).not.toHaveBeenCalled();
  });
  it.each(['deny', 'missing time', 'future time', 'completed result', 'stopping', 'ended'])(
    'blocks reviews for %s',
    (kind) => {
      const chat = fixture(kind === 'deny' ? 'deny' : 'ask_user');
      if (kind === 'missing time') chat.serverState!.pending_action!.review_started_ms = 0;
      if (kind === 'future time')
        chat.serverState!.pending_action!.review_started_ms = start + 60_000;
      if (kind === 'completed result') chat.serverState!.pending_action!.result_available = true;
      if (kind === 'stopping') chat.serverState!.stop_requested = true;
      if (kind === 'ended') chat.stopped = true;
      render(<ApprovalCard chat={chat} busy={false} />);
      expect(screen.getByRole('button', { name: 'Approve action' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Reject action' })).toBeDisabled();
    }
  );
  it('allows rejecting an unsupported replacement without accepting it', async () => {
    const chat = fixture('rewrite');
    chat.serverState!.pending_action!.rewritten = true;
    render(<ApprovalCard chat={chat} busy={false} />);
    expect(screen.getByRole('button', { name: 'Accept replacement' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject action' }));
    });
    expect(durableChatController.review).toHaveBeenCalledWith(
      'chat',
      approvalVersion(chat),
      false,
      false
    );
  });
  it.each([
    null,
    { type: 'gui_action', command: ['python3'] },
    { type: 'execute_command', command: [] },
    { type: 'execute_command', command: 'python3 report.py' },
  ])('blocks unsupported replacement data %j', (replacement) => {
    const chat = fixture('rewrite');
    chat.serverState!.pending_action!.admission!.evaluation.rewritten_action = replacement;
    render(<ApprovalCard chat={chat} busy={false} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Accept replacement' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject action' })).toBeEnabled();
  });
  it('prevents repeated refreshes and exposes refresh progress', async () => {
    let release!: () => void;
    vi.mocked(durableChatController.refresh).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const chat = fixture();
    chat.serverState!.pending_action!.review_started_ms = start - APPROVAL_DURATION_MS;
    render(<ApprovalCard chat={chat} busy={false} />);
    const refresh = screen.getByRole('button', { name: 'Refresh status' });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(durableChatController.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Checking status…' })).toBeDisabled();
    await act(async () => {
      release();
    });
  });
  it('blocks cached action decisions until connected and responds to offline events', () => {
    useComputerChatsStore.setState({ connections: {} });
    render(<ApprovalCard chat={fixture()} busy={false} />);
    expect(screen.getByRole('button', { name: 'Approve action' })).toBeDisabled();
    act(() =>
      useComputerChatsStore.setState({
        connections: { chat: { status: 'connected', failures: 0 } },
      })
    );
    expect(screen.getByRole('button', { name: 'Approve action' })).toBeEnabled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('button', { name: 'Approve action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  });
  it('prevents duplicate reviews while a response is pending', async () => {
    let release!: () => void;
    vi.mocked(durableChatController.review).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    render(<ApprovalCard chat={fixture()} busy={false} />);
    const approve = screen.getByRole('button', { name: 'Approve action' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(durableChatController.review).toHaveBeenCalledTimes(1);
    expect(approve).toBeDisabled();
    expect(screen.getByText('Submitting review…')).toBeInTheDocument();
    await act(async () => {
      release();
    });
  });
});
