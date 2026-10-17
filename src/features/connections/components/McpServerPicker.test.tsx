/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { McpServerPicker } from './McpServerPicker';
import type { McpServerOption } from '../hooks/useMcpServerOptions';

const options: McpServerOption[] = [
  {
    id: 'stateset-response',
    name: 'StateSet ResponseCX',
    isLocalOnly: false,
    isMcpServer: true,
    connected: true,
    toolCount: 12,
    tools: ['add_rule', 'list_agents'],
  },
  { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
  { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
];

function renderPicker(value: string[] = []) {
  const onChange = vi.fn();
  render(<McpServerPicker value={value} options={options} onChange={onChange} />);
  return onChange;
}

describe('McpServerPicker', () => {
  it('renders a toggle per option reflecting the selection', () => {
    renderPicker(['shopify']);

    expect(screen.getByRole('button', { name: /Shopify/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /StateSet ResponseCX/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('adds an option when toggled on', () => {
    const onChange = renderPicker(['shopify']);

    fireEvent.click(screen.getByRole('button', { name: /StateSet ResponseCX/ }));

    expect(onChange).toHaveBeenCalledWith(['shopify', 'stateset-response']);
  });

  it('removes an option when toggled off', () => {
    const onChange = renderPicker(['shopify', 'gorgias']);

    fireEvent.click(screen.getByRole('button', { name: /Shopify/ }));

    expect(onChange).toHaveBeenCalledWith(['gorgias']);
  });

  it('flags options that are not connected yet', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: /Gorgias/ })).toHaveTextContent('not connected');
    expect(screen.getByRole('button', { name: /Shopify/ })).not.toHaveTextContent('not connected');
  });

  it('shows selected ids that have no option as removable chips', () => {
    const onChange = renderPicker(['shopify', 'my-mcp']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove my-mcp' }));

    expect(onChange).toHaveBeenCalledWith(['shopify']);
  });

  it('adds custom server ids from the input, splitting commas and skipping duplicates', () => {
    const onChange = renderPicker(['shopify']);

    fireEvent.change(screen.getByLabelText('Add server by id'), {
      target: { value: ' my-mcp, shopify ,other ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith(['shopify', 'my-mcp', 'other']);
    expect(screen.getByLabelText('Add server by id')).toHaveValue('');
  });

  it('adds a custom server id when Enter is pressed', () => {
    const onChange = renderPicker();

    const input = screen.getByLabelText('Add server by id');
    fireEvent.change(input, { target: { value: 'my-mcp' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['my-mcp']);
  });

  it('ignores an empty custom id', () => {
    const onChange = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the verified tool count and names the tools in the tooltip', () => {
    renderPicker();

    const verified = screen.getByRole('button', { name: /StateSet ResponseCX/ });
    expect(verified).toHaveTextContent('12 tools');
    expect(verified).toHaveAttribute('title', expect.stringContaining('add_rule'));
  });

  it('shows no tool count for a server that has never been verified', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: /Shopify/ })).not.toHaveTextContent('tools');
  });
});
