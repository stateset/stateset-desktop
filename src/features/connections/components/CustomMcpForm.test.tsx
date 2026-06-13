/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomMcpForm } from './CustomMcpForm';

const mockShowToast = vi.fn();

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

function makeProps(overrides: Partial<Parameters<typeof CustomMcpForm>[0]> = {}) {
  return {
    isStoring: false,
    onAdd: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function fillForm({ serverId = '', endpoint = '', authToken = '' } = {}) {
  fireEvent.change(screen.getByPlaceholderText('my-mcp-server'), {
    target: { value: serverId },
  });
  fireEvent.change(screen.getByPlaceholderText('https://... or custom command'), {
    target: { value: endpoint },
  });
  if (authToken) {
    fireEvent.change(screen.getByPlaceholderText('Optional API key or token'), {
      target: { value: authToken },
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CustomMcpForm', () => {
  it('renders the form fields', () => {
    render(<CustomMcpForm {...makeProps()} />);

    expect(screen.getByText('Add custom MCP server')).toBeInTheDocument();
    expect(screen.getByText('Server identifier')).toBeInTheDocument();
    expect(screen.getByText('Endpoint / Command')).toBeInTheDocument();
    expect(screen.getByText('Auth token (optional)')).toBeInTheDocument();
  });

  it('shows an error toast when the server identifier is missing', async () => {
    const props = makeProps();
    render(<CustomMcpForm {...props} />);

    fillForm({ endpoint: 'https://mcp.example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', title: 'Missing info' })
      )
    );
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('shows an error toast when the endpoint is missing', async () => {
    const props = makeProps();
    render(<CustomMcpForm {...props} />);

    fillForm({ serverId: 'my-server' });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          message: 'Please provide an MCP endpoint or command.',
        })
      )
    );
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('rejects server identifiers shorter than 3 characters after normalization', async () => {
    const props = makeProps();
    render(<CustomMcpForm {...props} />);

    fillForm({ serverId: 'a!', endpoint: 'https://mcp.example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', title: 'Invalid server id' })
      )
    );
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('adds the server with a normalized id and trimmed endpoint', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<CustomMcpForm {...makeProps({ onAdd })} />);

    fillForm({ serverId: '  My MCP Server! ', endpoint: ' https://mcp.example.com ' });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('my-mcp-server', {
        endpoint: 'https://mcp.example.com',
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Custom MCP server added' })
    );
  });

  it('includes the auth token only when provided', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<CustomMcpForm {...makeProps({ onAdd })} />);

    fillForm({
      serverId: 'my-server',
      endpoint: 'https://mcp.example.com',
      authToken: ' secret-token ',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('my-server', {
        endpoint: 'https://mcp.example.com',
        auth_token: 'secret-token',
      })
    );
  });

  it('clears the fields after a successful add', async () => {
    render(<CustomMcpForm {...makeProps()} />);

    fillForm({ serverId: 'my-server', endpoint: 'https://mcp.example.com', authToken: 'tok' });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() => expect(screen.getByPlaceholderText('my-mcp-server')).toHaveValue(''));
    expect(screen.getByPlaceholderText('https://... or custom command')).toHaveValue('');
    expect(screen.getByPlaceholderText('Optional API key or token')).toHaveValue('');
  });

  it('disables the add button while storing', () => {
    render(<CustomMcpForm {...makeProps({ isStoring: true })} />);
    // Button shows a spinner instead of its label while storing
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(screen.queryByText('Add server')).not.toBeInTheDocument();
  });

  it('calls onCancel from the cancel button', () => {
    const props = makeProps();
    render(<CustomMcpForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
