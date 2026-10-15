/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalMcpServerCard } from './LocalMcpServerCard';
import { STATESET_STDIO_MCP_SERVERS, formatStdioClientConfig } from '../statesetMcpServers';

const nsr = STATESET_STDIO_MCP_SERVERS.find((s) => s.id === 'stateset-nsr')!;
const voice = STATESET_STDIO_MCP_SERVERS.find((s) => s.id === 'stateset-voice')!;

describe('LocalMcpServerCard', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('renders the server name, description and local-only badge', () => {
    render(<LocalMcpServerCard server={nsr} />);

    expect(screen.getByRole('heading', { name: 'StateSet NSR' })).toBeInTheDocument();
    expect(screen.getByText(nsr.description)).toBeInTheDocument();
    expect(screen.getByText('Local only')).toBeInTheDocument();
  });

  it('shows the MCP client config for the server', () => {
    render(<LocalMcpServerCard server={nsr} />);

    expect(screen.getByTestId('mcp-config-stateset-nsr').textContent).toBe(
      formatStdioClientConfig(nsr)
    );
  });

  it('shows a setup note only when the server has one', () => {
    const { rerender } = render(<LocalMcpServerCard server={nsr} />);
    expect(screen.queryByText(/Not published to npm/)).not.toBeInTheDocument();

    rerender(<LocalMcpServerCard server={voice} />);
    expect(screen.getByText(voice.setupNote!)).toBeInTheDocument();
  });

  it('copies the config to the clipboard', async () => {
    render(<LocalMcpServerCard server={nsr} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy StateSet NSR MCP config' }));

    expect(writeText).toHaveBeenCalledWith(formatStdioClientConfig(nsr));
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
  });

  it('does nothing when the clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<LocalMcpServerCard server={nsr} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy StateSet NSR MCP config' }));

    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});
