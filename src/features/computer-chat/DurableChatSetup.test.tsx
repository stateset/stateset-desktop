/** @vitest-environment happy-dom */
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableChatSetup } from './DurableChatSetup';
import { DEFAULT_CHAT_CONFIGURATION, type DurableChatConfiguration } from './durableTypes';
import type { CheckedSetup } from './setup';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';

const request = vi.fn();
const onReport = vi.fn();
const onError = vi.fn();
const ready = {
  version: 1,
  ready: true,
  checks: [{ key: 'sandbox', status: 'pass', message: 'Computer service ready' }],
  mcp_servers: [
    { key: 'reports', ready: true },
    { key: 'inventory', ready: true },
  ],
};
function Harness({
  brandId = 'brand',
  initial = DEFAULT_CHAT_CONFIGURATION,
}: {
  brandId?: string;
  initial?: DurableChatConfiguration;
}) {
  const [configuration, setConfiguration] = useState(initial);
  const [checked, setChecked] = useState<CheckedSetup | null>(null);
  return (
    <DurableChatSetup
      tenantId="tenant"
      brandId={brandId}
      configuration={configuration}
      onChange={setConfiguration}
      report={checked?.report ?? null}
      onReport={(value) => {
        onReport(value);
        setChecked(value);
      }}
      onError={onError}
    />
  );
}
const check = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save connection and check' }));
beforeEach(() => {
  vi.resetAllMocks();
  useDurableWorkflowsStore.setState({
    initialized: true,
    engineUrl: 'https://engine.example',
    apiKey: 'original',
    connectionRevision: null,
    configuring: false,
  });
  window.electronAPI = {
    store: { set: vi.fn().mockResolvedValue(true) },
    auth: { setDurableEngineApiKey: vi.fn().mockResolvedValue(true) },
    computerChat: { request },
  } as unknown as typeof window.electronAPI;
  request.mockResolvedValue({ ok: true, status: 200, body: ready });
});
afterEach(cleanup);
describe('connection setup readiness', () => {
  it.each(['/workspace/./report.json', '/workspace/a\\b.json'])(
    'keeps an invalid %s criterion draft editable',
    (path) => {
      render(<Harness />);
      fireEvent.click(screen.getByText('Acceptance criteria (0)'));
      fireEvent.change(screen.getByLabelText('File path'), { target: { value: path } });
      fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
      expect(screen.queryByRole('button', { name: 'Remove criterion 1' })).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Choose a file under /workspace');
      expect(screen.getByLabelText('File path')).toHaveValue(path);
      fireEvent.change(screen.getByLabelText('File path'), {
        target: { value: '/workspace/report.json' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
      expect(screen.getByRole('button', { name: 'Remove criterion 1' })).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );
  it('rejects a fifth file while allowing another check for an existing file', () => {
    render(
      <Harness
        initial={{
          ...DEFAULT_CHAT_CONFIGURATION,
          criteria: Array.from({ length: 4 }, (_, index) => ({
            path: `/workspace/${index}.json`,
            kind: 'json',
            expected: true,
          })),
        }}
      />
    );
    fireEvent.click(screen.getByText('Acceptance criteria (4)'));
    fireEvent.change(screen.getByLabelText('File path'), {
      target: { value: '/workspace/fifth.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    expect(screen.queryByRole('button', { name: 'Remove criterion 5' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Use at most four distinct files');
    fireEvent.change(screen.getByLabelText('File path'), {
      target: { value: '/workspace/0.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    expect(screen.getByRole('button', { name: 'Remove criterion 5' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('explains invalid expected JSON beside the preserved draft', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Acceptance criteria (0)'));
    fireEvent.change(screen.getByLabelText('Expected JSON'), { target: { value: '{unfinished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter valid JSON for the expected value');
    expect(screen.getByLabelText('Expected JSON')).toHaveValue('{unfinished');
    expect(screen.queryByRole('button', { name: 'Remove criterion 1' })).not.toBeInTheDocument();
  });
  it('explains session-only keys when the system keyring is unavailable', async () => {
    window.electronAPI!.auth.isSecureStorageAvailable = vi.fn().mockResolvedValue(false);
    render(<Harness />);
    expect(await screen.findByText(/The API key lasts until you quit the app/)).toBeVisible();
    expect(screen.getByLabelText('Workflow API key')).toHaveAttribute(
      'placeholder',
      'Use current key'
    );
  });
  it('does not show a keyring warning when secure storage is available', async () => {
    const checkStorage = vi.fn().mockResolvedValue(true);
    window.electronAPI!.auth.isSecureStorageAvailable = checkStorage;
    render(<Harness />);
    await waitFor(() => expect(checkStorage).toHaveBeenCalledOnce());
    expect(screen.queryByText(/The API key lasts until you quit the app/)).not.toBeInTheDocument();
  });
  it('binds a validated check to the saved connection and selected tools', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Workflow engine URL'), {
      target: { value: 'https://next.example/' },
    });
    fireEvent.change(screen.getByLabelText('Workflow API key'), {
      target: { value: 'replacement' },
    });
    check();
    await waitFor(() =>
      expect(onReport).toHaveBeenLastCalledWith({
        report: ready,
        context: {
          tenantId: 'tenant',
          brandId: 'brand',
          engineUrl: 'https://next.example',
          apiKey: 'replacement',
          connectionRevision: null,
          configuring: false,
          mcpServers: [],
        },
      })
    );
    expect(request.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant',
      body: { brand_id: 'brand', mcp_servers: [] },
    });
    expect(JSON.stringify(request.mock.calls[0][0].body)).not.toContain('replacement');
    expect(screen.getByLabelText('Workflow API key')).toHaveValue('');
  });
  it.each(['url', 'key', 'engine changed'])('discards a delayed result after %s', async (kind) => {
    let release!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, body: ready });
        })
    );
    render(<Harness />);
    check();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    if (kind === 'url')
      fireEvent.change(screen.getByLabelText('Workflow engine URL'), {
        target: { value: 'https://changed.example' },
      });
    if (kind === 'key')
      fireEvent.change(screen.getByLabelText('Workflow API key'), {
        target: { value: 'different' },
      });
    if (kind === 'engine changed')
      act(() => useDurableWorkflowsStore.setState({ engineUrl: 'https://changed.example' }));
    await act(async () => {
      release();
    });
    expect(onReport.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('discards a response when the parent changes the selected tools', async () => {
    let release!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, body: ready });
        })
    );
    const props = {
      tenantId: 'tenant',
      brandId: 'brand',
      configuration: DEFAULT_CHAT_CONFIGURATION,
      onChange: vi.fn(),
      onReport,
      onError,
      report: null,
    };
    const { rerender } = render(<DurableChatSetup {...props} />);
    check();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    rerender(
      <DurableChatSetup
        {...props}
        configuration={{ ...DEFAULT_CHAT_CONFIGURATION, mcp_servers: ['reports'] }}
      />
    );
    await act(async () => release());
    expect(onReport.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('ignores a delayed result and failure after unmounting for another brand', async () => {
    let reject!: (reason: Error) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    const { unmount } = render(<Harness />);
    check();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    unmount();
    render(<Harness brandId="other" />);
    await act(async () => reject(new Error('Old workspace failure')));
    expect(onError).not.toHaveBeenCalledWith('Old workspace failure');
    expect(onReport.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('keeps the tool catalog visible while selection invalidates readiness', async () => {
    render(<Harness />);
    check();
    await screen.findByText(/Computer service ready/);
    fireEvent.click(screen.getByText('Defaults and permissions'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'reports' }));
    expect(onReport).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('checkbox', { name: 'inventory' })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventory' }));
    check();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0].body.mcp_servers).toEqual(['reports', 'inventory']);
  });
  it('invalidates an accepted report immediately when the key is edited', async () => {
    render(<Harness />);
    check();
    await screen.findByText(/Computer service ready/);
    fireEvent.change(screen.getByLabelText('Workflow API key'), { target: { value: 'different' } });
    expect(onReport).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/Computer service ready/)).not.toBeInTheDocument();
  });
  it('prevents duplicate checks while awaiting a response', async () => {
    let release!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, body: ready });
        })
    );
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Save connection and check' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await act(async () => release());
  });
  it.each([
    { ...ready, ready: 'yes' },
    { ...ready, checks: [] },
    { ...ready, checks: [{ key: 'sandbox', status: 'fail', message: 'Not ready' }] },
  ])('rejects malformed or contradictory readiness instead of enabling creation', async (body) => {
    request.mockResolvedValue({ ok: true, status: 200, body });
    render(<Harness />);
    check();
    await waitFor(() =>
      expect(onError.mock.calls.some(([message]) => Boolean(message))).toBe(true)
    );
    expect(onReport.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('rejects a ready response that does not confirm a selected tool', async () => {
    request.mockResolvedValue({ ok: true, status: 200, body: { ...ready, mcp_servers: [] } });
    render(
      <DurableChatSetup
        tenantId="tenant"
        brandId="brand"
        configuration={{ ...DEFAULT_CHAT_CONFIGURATION, mcp_servers: ['reports'] }}
        onChange={vi.fn()}
        onReport={onReport}
        onError={onError}
        report={null}
      />
    );
    check();
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('selected tools'))
    );
    expect(onReport.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('discards an old connection failure after another connection is selected', async () => {
    let reject!: (error: Error) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    render(<Harness />);
    check();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    act(() => useDurableWorkflowsStore.setState({ engineUrl: 'https://other.example' }));
    await act(async () => reject(new Error('Old engine failure')));
    expect(onError).not.toHaveBeenCalledWith('Old engine failure');
  });
});
