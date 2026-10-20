/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SandboxArtifactPanel } from './SandboxArtifactPanel';
import { computerChatRuntime } from './runtime';
import type { ComputerChat } from './types';

vi.mock('./runtime', () => ({ computerChatRuntime: { verifyArtifact: vi.fn() } }));
const chat: ComputerChat = {
  id: 'chat',
  tenantId: 'tenant',
  brandId: 'brand',
  title: 'Computer',
  createdAt: '',
  updatedAt: '',
  messages: [],
  workflows: [],
  sandboxApiSession: { version: 1 },
  session: { id: 'session', organizationId: 'org', currentSandboxId: 'sandbox', status: 'running' },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(computerChatRuntime.verifyArtifact).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('submits the user expectation without asking the agent to judge its own output', async () => {
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace/report.txt' },
  });
  fireEvent.change(screen.getByLabelText('Expected value'), { target: { value: 'Revenue: $42' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Check file with NSR' }));
  });
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledWith('chat', {
    path: '/workspace/report.txt',
    kind: 'contains',
    expected: 'Revenue: $42',
  });
});

it('prevents repeated submissions while a check is pending', async () => {
  let finish!: () => void;
  vi.mocked(computerChatRuntime.verifyArtifact).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace/file' },
  });
  fireEvent.change(screen.getByLabelText('Expected value'), { target: { value: 'proof' } });
  const button = screen.getByRole('button', { name: 'Check file with NSR' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledOnce();
  await act(async () => finish());
});

it('keeps field names stable while editing and permits checking exact empty text', async () => {
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file', { exact: true }), {
    target: { value: '/workspace/empty.txt' },
  });
  fireEvent.change(screen.getByLabelText('Expected value', { exact: true }), {
    target: { value: 'First value' },
  });
  expect(screen.getByLabelText('Expected value', { exact: true })).toHaveValue('First value');
  fireEvent.change(screen.getByLabelText('File check', { exact: true }), {
    target: { value: 'equals' },
  });
  fireEvent.change(screen.getByLabelText('Expected value', { exact: true }), {
    target: { value: '' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Check file with NSR' }));
  });
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledWith('chat', {
    path: '/workspace/empty.txt',
    kind: 'equals',
    expected: '',
  });
});

it.each([{ busy: true }, { stopped: true }, { sandboxStopRequested: true }])(
  'prevents checking during incompatible work %j',
  (state) => {
    render(<SandboxArtifactPanel chat={{ ...chat, ...state }} busy={Boolean(state.busy)} />);
    fireEvent.click(screen.getByText('Verify a file'));
    expect(screen.getByRole('button', { name: 'Check file with NSR' })).toBeDisabled();
    expect(screen.getByLabelText('Workspace file')).toBeDisabled();
    expect(screen.getByRole('form', { name: 'File verification' })).toHaveAttribute(
      'aria-busy',
      'false'
    );
  }
);

it.each(['/workspace/../private', '/etc/passwd', '/workspace/', `/workspace/${'é'.repeat(600)}`])(
  'rejects invalid path %s inline without dispatch',
  async (path) => {
    render(<SandboxArtifactPanel chat={chat} busy={false} />);
    fireEvent.click(screen.getByText('Verify a file'));
    const input = screen.getByLabelText('Workspace file');
    fireEvent.change(input, { target: { value: path } });
    fireEvent.change(screen.getByLabelText('Expected value'), { target: { value: 'proof' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/workspace/);
    expect(screen.getByRole('button', { name: 'Check file with NSR' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'File verification' }));
    expect(input).toHaveFocus();
    expect(computerChatRuntime.verifyArtifact).not.toHaveBeenCalled();
  }
);

it('rejects invalid digests and oversized expectations while preserving the entries for correction', () => {
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace/proof' },
  });
  fireEvent.change(screen.getByLabelText('File check'), { target: { value: 'sha256' } });
  const expected = screen.getByLabelText('Expected value');
  fireEvent.change(expected, { target: { value: 'invalid digest' } });
  expect(expected).toHaveAttribute('aria-invalid', 'true');
  expect(expected).toHaveAccessibleDescription(/64-character SHA-256/);
  fireEvent.submit(screen.getByRole('form', { name: 'File verification' }));
  expect(expected).toHaveFocus();
  fireEvent.change(screen.getByLabelText('File check'), { target: { value: 'contains' } });
  const value = '\u0001'.repeat(3000);
  fireEvent.change(expected, { target: { value } });
  expect(expected).toHaveValue(value);
  expect(screen.getByRole('alert')).toHaveTextContent('16,384 JSON-encoded bytes');
  expect(computerChatRuntime.verifyArtifact).not.toHaveBeenCalled();
});

it('submits a normalized digest while preserving the entered value', async () => {
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace//proof' },
  });
  fireEvent.change(screen.getByLabelText('File check'), { target: { value: 'sha256' } });
  fireEvent.change(screen.getByLabelText('Expected value'), {
    target: { value: ` ${'A'.repeat(64)} ` },
  });
  await act(async () => {
    fireEvent.submit(screen.getByRole('form', { name: 'File verification' }));
  });
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledWith('chat', {
    path: '/workspace/proof',
    kind: 'sha256',
    expected: 'a'.repeat(64),
  });
  expect(screen.getByLabelText('Expected value')).toHaveValue(` ${'A'.repeat(64)} `);
});

it('retains entries and offers retry after an unexpected failure without exposing backend details', async () => {
  vi.mocked(computerChatRuntime.verifyArtifact).mockRejectedValueOnce(
    new Error('private backend details')
  );
  render(<SandboxArtifactPanel chat={chat} busy={false} />);
  fireEvent.click(screen.getByText('Verify a file'));
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace/proof' },
  });
  fireEvent.change(screen.getByLabelText('Expected value'), { target: { value: 'proof' } });
  const button = screen.getByRole('button', { name: 'Check file with NSR' });
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Your entries are retained')
  );
  expect(screen.queryByText(/private backend/)).toBeNull();
  expect(screen.getByLabelText('Expected value')).toHaveValue('proof');
  expect(button).toBeEnabled();
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledOnce();
  await act(async () => {
    fireEvent.click(button);
  });
  expect(computerChatRuntime.verifyArtifact).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('distinguishes a matching observation from an NSR refusal', () => {
  render(
    <SandboxArtifactPanel
      chat={{
        ...chat,
        artifactVerification: {
          observationMatched: true,
          requestId: 'request',
          sessionId: 'session',
          sandboxId: 'sandbox',
          organizationId: 'org',
          checkedAt: '2026-10-19T00:00:00Z',
          path: '/workspace/report.txt',
          sha256: 'a'.repeat(64),
          criterionSha256: 'b'.repeat(64),
          kind: 'equals',
          sizeBytes: 10,
          verification: {
            verified: false,
            outcome: 'failed',
            manifest_sha256: 'c'.repeat(64),
            checks: [
              {
                path: '/workspace/report.txt',
                kind: 'equals',
                passed: false,
                detail: 'NSR refused',
                sha256: 'a'.repeat(64),
              },
            ],
            evidence_ids: ['decision-1'],
          },
        },
      }}
      busy={false}
    />
  );
  expect(
    screen.getByText('Collected file matched; NSR did not accept this check.')
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText('Verify a file'));
  expect(screen.getByText('Last recorded check')).toBeVisible();
  expect(screen.getByText(`SHA-256: ${'a'.repeat(64)}`)).not.toBeVisible();
  fireEvent.change(screen.getByLabelText('Workspace file'), {
    target: { value: '/workspace/other.txt' },
  });
  expect(screen.getByText('These form edits have not been checked.')).toBeVisible();
  expect(computerChatRuntime.verifyArtifact).not.toHaveBeenCalled();
});
