/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickConfigBar } from './QuickConfigBar';

vi.mock('../../connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => [
    {
      id: 'stateset-sync',
      name: 'StateSet Sync',
      isLocalOnly: false,
      isMcpServer: true,
      connected: true,
    },
    { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
  ],
  useMcpServerOptionsState: () => ({
    options: [
      {
        id: 'stateset-sync',
        name: 'StateSet Sync',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
      },
      { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
    ],
    isLoading: false,
  }),
}));

function makeProps(overrides: Partial<Parameters<typeof QuickConfigBar>[0]> = {}) {
  return {
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    onModelChange: vi.fn(),
    onTemperatureChange: vi.fn(),
    mcpServers: [] as string[],
    onMcpServersChange: vi.fn(),
    ...overrides,
  };
}

describe('QuickConfigBar', () => {
  it('renders the model options', () => {
    render(<QuickConfigBar {...makeProps()} />);

    expect(screen.getByRole('option', { name: 'Sonnet 4.6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Opus 4.6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Haiku 4.5' })).toBeInTheDocument();
  });

  it('reflects the selected model', () => {
    render(<QuickConfigBar {...makeProps({ model: 'claude-opus-4-6' })} />);
    expect(screen.getByRole('combobox')).toHaveValue('claude-opus-4-6');
  });

  it('calls onModelChange when a different model is picked', () => {
    const onModelChange = vi.fn();
    render(<QuickConfigBar {...makeProps({ onModelChange })} />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'claude-haiku-4-5-20251001' },
    });
    expect(onModelChange).toHaveBeenCalledWith('claude-haiku-4-5-20251001');
  });

  it('displays the temperature with one decimal place', () => {
    render(<QuickConfigBar {...makeProps({ temperature: 1 })} />);
    expect(screen.getByText('1.0')).toBeInTheDocument();
  });

  it('calls onTemperatureChange with a numeric value', () => {
    const onTemperatureChange = vi.fn();
    render(<QuickConfigBar {...makeProps({ onTemperatureChange })} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '1.3' } });
    expect(onTemperatureChange).toHaveBeenCalledWith(1.3);
  });

  describe('MCP servers', () => {
    it('summarises how many servers are selected', () => {
      render(<QuickConfigBar {...makeProps({ mcpServers: ['shopify', 'stateset-sync'] })} />);

      expect(screen.getByRole('button', { name: /MCP servers/ })).toHaveTextContent('2 servers');
    });

    it('says none when nothing is selected', () => {
      render(<QuickConfigBar {...makeProps()} />);

      expect(screen.getByRole('button', { name: /MCP servers/ })).toHaveTextContent('None');
    });

    it('keeps the picker hidden until the summary is clicked', () => {
      render(<QuickConfigBar {...makeProps()} />);

      const toggle = screen.getByRole('button', { name: /MCP servers/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('group', { name: 'MCP Servers' })).not.toBeInTheDocument();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('group', { name: 'MCP Servers' })).toBeInTheDocument();
    });

    it('reports a server the user selects', () => {
      const onMcpServersChange = vi.fn();
      render(<QuickConfigBar {...makeProps({ onMcpServersChange })} />);

      fireEvent.click(screen.getByRole('button', { name: /MCP servers/ }));
      fireEvent.click(screen.getByRole('button', { name: /StateSet Sync/ }));

      expect(onMcpServersChange).toHaveBeenCalledWith(['stateset-sync']);
    });
  });
});
