/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActionRecoveryPanel } from './ActionRecoveryPanel';
import { computerChatRuntime } from './runtime';
import type { ComputerChat, PendingAction } from './types';

vi.mock('./runtime', () => ({ computerChatRuntime: { resume: vi.fn(), refresh: vi.fn() } }));
const pending: PendingAction = {
  requestId: 'request',
  computer: { sessionId: 'session', sandboxId: 'computer', organizationId: 'org' },
  action: { name: 'execute', arguments: { command: ['pwd'] } },
  command: ['pwd'],
  durable: false,
  verify: true,
};
const result = {
  exitCode: 1,
  stdout: 'saved observation',
  stderr: 'reported error',
  outputTruncated: false,
};
const chat = (patch: Partial<ComputerChat> = {}): ComputerChat => ({
  id: 'chat',
  tenantId: 'tenant',
  brandId: 'brand',
  title: 'Task',
  createdAt: '',
  updatedAt: '',
  messages: [],
  workflows: [],
  sandboxApiSession: { version: 1 },
  pending,
  session: {
    id: 'session',
    organizationId: 'org',
    currentSandboxId: 'computer',
    status: 'running',
  },
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(computerChatRuntime.resume).mockResolvedValue(undefined);
  vi.mocked(computerChatRuntime.refresh).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('explains that a saved result is unaccepted and recovers it only on explicit request', async () => {
  render(<ActionRecoveryPanel chat={chat({ pending: { ...pending, result } })} busy={false} />);
  expect(screen.getByRole('heading', { name: 'Result awaiting review' })).toBeInTheDocument();
  expect(screen.getByText(/without running the action again/)).toBeInTheDocument();
  expect(computerChatRuntime.resume).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Verify saved result' }))
  );
  expect(computerChatRuntime.resume).toHaveBeenCalledWith('chat');
  expect(computerChatRuntime.resume).toHaveBeenCalledOnce();
  expect(computerChatRuntime.refresh).not.toHaveBeenCalled();
});

it.each([
  [{ ...pending, workflowId: 'existing-workflow' }, 'Check workflow'],
  [pending, 'Recover action'],
  [{ ...pending, result, verify: false }, 'Recover saved result'],
] as const)('offers the recovery appropriate to the recorded state (%s)', async (value, label) => {
  render(<ActionRecoveryPanel chat={chat({ pending: value })} busy={false} />);
  if (!value.workflowId && !value.result)
    expect(screen.getByText(/recovery can run the original action/)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
  expect(computerChatRuntime.resume).toHaveBeenCalledWith('chat');
  expect(computerChatRuntime.resume).toHaveBeenCalledOnce();
});

it.each(['sandboxId', 'sessionId', 'organizationId'] as const)(
  'offers only read-only status checking after %s changes',
  async (field) => {
    render(
      <ActionRecoveryPanel
        chat={chat({
          pending: { ...pending, computer: { ...pending.computer!, [field]: 'other' }, result },
        })}
        busy={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Computer changed' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Recover|Verify|workflow/ })
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Check computer status' }))
    );
    expect(computerChatRuntime.refresh).toHaveBeenCalledWith('chat');
    expect(computerChatRuntime.refresh).toHaveBeenCalledOnce();
    expect(computerChatRuntime.resume).not.toHaveBeenCalled();
  }
);

it('keeps older action details visible without offering unbound execution', () => {
  render(
    <ActionRecoveryPanel
      chat={chat({ pending: { ...pending, computer: undefined } })}
      busy={false}
    />
  );
  expect(screen.getByRole('heading', { name: 'Action needs review' })).toBeInTheDocument();
  expect(screen.getByText(/Stop the computer and start a new chat/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(computerChatRuntime.resume).not.toHaveBeenCalled();
});

it('checks unavailable computers without offering provisioning', async () => {
  render(
    <ActionRecoveryPanel
      chat={chat({ session: { ...chat().session!, status: 'pending', currentSandboxId: null } })}
      busy={false}
    />
  );
  expect(screen.getByText(/will not start a computer/)).toBeInTheDocument();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Check computer status' }))
  );
  expect(computerChatRuntime.resume).not.toHaveBeenCalled();
  expect(computerChatRuntime.refresh).toHaveBeenCalledOnce();
});

it('blocks overlapping recovery requests and disables controls while busy', async () => {
  let finish!: () => void;
  vi.mocked(computerChatRuntime.resume).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<ActionRecoveryPanel chat={chat()} busy={false} />);
  const button = screen.getByRole('button', { name: 'Recover action' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(computerChatRuntime.resume).toHaveBeenCalledOnce();
  await act(async () => finish());
  view.rerender(<ActionRecoveryPanel chat={chat()} busy />);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(computerChatRuntime.resume).toHaveBeenCalledOnce();
});

it('renders bounded untrusted output as plain text with truncation disclosed', () => {
  const stdout = '<img src=x onerror=alert(1)>'.repeat(300);
  const view = render(
    <ActionRecoveryPanel
      chat={chat({ pending: { ...pending, result: { ...result, stdout } } })}
      busy={false}
    />
  );
  fireEvent.click(screen.getByText('Saved output'));
  expect(screen.getByLabelText('Saved standard output').textContent).toBe(stdout.slice(0, 4000));
  expect(screen.getByText(/Output preview shortened/)).toBeInTheDocument();
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByText(/Unverified output/)).toBeInTheDocument();
});

it('does not render saved screenshot bytes as an image or a text preview', () => {
  const view = render(
    <ActionRecoveryPanel
      chat={chat({
        pending: {
          ...pending,
          action: { name: 'screenshot', arguments: {} },
          result: { ...result, stdout: 'iVBORprivate-pixels' },
        },
      })}
      busy={false}
    />
  );
  fireEvent.click(screen.getByText('Saved output'));
  expect(screen.getByText(/Screenshot pixels are not restored/)).toBeInTheDocument();
  expect(view.container.textContent).not.toContain('iVBORprivate-pixels');
  expect(view.container.querySelector('img')).toBeNull();
});
