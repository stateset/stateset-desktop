/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { McpProbeButton } from './McpProbeButton';

const probe = vi.fn();

function setElectronApi(api: unknown) {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  setElectronApi({ mcp: { probe } });
});

afterEach(() => {
  setElectronApi(undefined);
});

describe('McpProbeButton', () => {
  it('is disabled without an endpoint', () => {
    render(<McpProbeButton endpoint="" />);

    expect(screen.getByRole('button', { name: 'Test server' })).toBeDisabled();
  });

  it('reports the server name, version and tool count on success', async () => {
    probe.mockResolvedValue({
      ok: true,
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      protocolVersion: '2025-06-18',
      toolCount: 3,
      tools: ['list_orders', 'get_order', 'sync_inventory'],
    });
    render(<McpProbeButton endpoint="https://api.sync.stateset.com/mcp" authToken="ss_sync_x" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(probe).toHaveBeenCalledWith({
      endpoint: 'https://api.sync.stateset.com/mcp',
      authToken: 'ss_sync_x',
    });
    expect(await screen.findByText(/stateset-sync/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 tools');
    expect(screen.getByRole('status')).toHaveTextContent('list_orders');
  });

  it('uses the singular form for a single tool', async () => {
    probe.mockResolvedValue({
      ok: true,
      serverName: 'tiny',
      serverVersion: '1.0.0',
      protocolVersion: '2025-06-18',
      toolCount: 1,
      tools: ['only_tool'],
    });
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(await screen.findByRole('status')).toHaveTextContent('1 tool');
  });

  it('shows the failure message the probe returns', async () => {
    probe.mockResolvedValue({ ok: false, error: 'Unauthorized — check the API key.', status: 401 });
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" authToken="bad" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized — check the API key.');
  });

  it('omits an empty auth token from the request', async () => {
    probe.mockResolvedValue({ ok: false, error: 'nope' });
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" authToken="   " />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    await waitFor(() =>
      expect(probe).toHaveBeenCalledWith({ endpoint: 'https://mcp.example.com/mcp' })
    );
  });

  it('reports a thrown IPC error', async () => {
    probe.mockRejectedValue(new Error('IPC rate limit exceeded for mcp:probe'));
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IPC rate limit exceeded');
  });

  it('explains that testing needs the desktop app', async () => {
    setElectronApi(undefined);
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Testing is only available in the desktop app.'
    );
  });

  it('shows progress while the probe runs', async () => {
    let resolveProbe: (value: unknown) => void = () => {};
    probe.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      })
    );
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    const button = screen.getByRole('button', { name: 'Test server' });
    expect(button).toBeDisabled();

    resolveProbe({ ok: false, error: 'done' });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('reports a successful handshake to onVerified', async () => {
    const onVerified = vi.fn();
    const success = {
      ok: true,
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      protocolVersion: '2025-06-18',
      toolCount: 3,
      tools: ['a'],
    };
    probe.mockResolvedValue(success);
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" onVerified={onVerified} />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(success));
  });

  it('does not report a failed handshake', async () => {
    const onVerified = vi.fn();
    probe.mockResolvedValue({ ok: false, error: 'nope' });
    render(<McpProbeButton endpoint="https://mcp.example.com/mcp" onVerified={onVerified} />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('drops a result that no longer describes the current endpoint', async () => {
    probe.mockResolvedValue({
      ok: true,
      serverName: 'first',
      serverVersion: '1.0.0',
      protocolVersion: '2025-06-18',
      toolCount: 1,
      tools: ['a'],
    });
    const { rerender } = render(<McpProbeButton endpoint="https://a.example/mcp" />);

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));
    expect(await screen.findByText(/first/)).toBeInTheDocument();

    rerender(<McpProbeButton endpoint="https://b.example/mcp" />);

    expect(screen.queryByText(/first/)).not.toBeInTheDocument();
  });

  it('discards a probe that finishes after the endpoint moved on', async () => {
    let resolveProbe: (value: unknown) => void = () => {};
    probe.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      })
    );
    const onVerified = vi.fn();
    const { rerender } = render(
      <McpProbeButton endpoint="https://a.example/mcp" onVerified={onVerified} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Test server' }));
    rerender(<McpProbeButton endpoint="https://b.example/mcp" onVerified={onVerified} />);

    resolveProbe({
      ok: true,
      serverName: 'server-a',
      serverVersion: '1.0.0',
      protocolVersion: '2025-06-18',
      toolCount: 9,
      tools: ['a'],
    });

    await waitFor(() => expect(probe).toHaveBeenCalled());
    // A's answer must not be shown for, or recorded against, B.
    expect(screen.queryByText(/server-a/)).not.toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
    // ...and the button must be usable again for the corrected endpoint.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test server' })).toBeEnabled());
  });
});
