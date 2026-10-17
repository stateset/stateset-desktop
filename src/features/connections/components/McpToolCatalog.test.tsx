/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { McpToolCatalog } from './McpToolCatalog';
import type { McpServerOption } from '../hooks/useMcpServerOptions';

const servers: McpServerOption[] = [
  {
    id: 'stateset-sync',
    name: 'StateSet Sync',
    connected: true,
    isLocalOnly: false,
    isMcpServer: true,
    toolCount: 3,
    tools: ['list_orders', 'get_order', 'sync_inventory'],
    verifiedAt: new Date().toISOString(),
  },
  {
    id: 'stateset-response',
    name: 'StateSet ResponseCX',
    connected: true,
    isLocalOnly: false,
    isMcpServer: true,
    toolCount: 2,
    tools: ['add_rule', 'list_agents'],
    verifiedAt: new Date().toISOString(),
  },
  // Connected but never verified: nothing is known about its tools.
  { id: 'my-mcp', name: 'my-mcp', connected: true, isLocalOnly: false, isMcpServer: true },
  // Not connected, so it does not belong in the catalog.
  {
    id: 'stateset-engine',
    name: 'StateSet Engine',
    connected: false,
    isLocalOnly: false,
    isMcpServer: true,
    toolCount: 1,
    tools: ['run_workflow'],
    verifiedAt: new Date().toISOString(),
  },
];

function open(options = servers) {
  render(<McpToolCatalog servers={options} />);
  fireEvent.click(screen.getByRole('button', { name: /Tool catalog/ }));
}

describe('McpToolCatalog', () => {
  it('stays collapsed until opened', () => {
    render(<McpToolCatalog servers={servers} />);

    expect(screen.queryByText('list_orders')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tool catalog/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('lists the tools of every verified, connected server', () => {
    open();

    expect(screen.getByText('list_orders')).toBeInTheDocument();
    expect(screen.getByText('add_rule')).toBeInTheDocument();
    // Not connected — excluded.
    expect(screen.queryByText('run_workflow')).not.toBeInTheDocument();
  });

  it('summarises how many tools are known', () => {
    render(<McpToolCatalog servers={servers} />);

    expect(screen.getByRole('button', { name: /Tool catalog/ })).toHaveTextContent('5 tools');
  });

  it('filters tools by name', () => {
    open();

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'order' } });

    expect(screen.getByText('list_orders')).toBeInTheDocument();
    expect(screen.getByText('get_order')).toBeInTheDocument();
    expect(screen.queryByText('add_rule')).not.toBeInTheDocument();
    // A server with no match drops out entirely.
    expect(screen.queryByText('StateSet ResponseCX')).not.toBeInTheDocument();
  });

  it('matches a server by its own name too', () => {
    open();

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'responsecx' } });

    const group = screen.getByTestId('catalog-stateset-response');
    expect(within(group).getByText('add_rule')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-stateset-sync')).not.toBeInTheDocument();
  });

  it('says when a search matches nothing', () => {
    open();

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'zzz' } });

    expect(screen.getByText('No tools match that search.')).toBeInTheDocument();
  });

  it('explains the empty state when nothing has been verified', () => {
    open([
      { id: 'my-mcp', name: 'my-mcp', connected: true, isLocalOnly: false, isMcpServer: true },
    ]);

    expect(screen.getByText('Test a server to see the tools it offers.')).toBeInTheDocument();
  });

  it('renders nothing at all when no MCP server is connected', () => {
    const { container } = render(
      <McpToolCatalog
        servers={[
          {
            id: 'shopify',
            name: 'Shopify',
            connected: true,
            isLocalOnly: false,
            isMcpServer: false,
          },
        ]}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('counts the tools the servers reported, not just the stored sample', () => {
    render(
      <McpToolCatalog
        servers={[
          {
            id: 'big',
            name: 'Big Server',
            connected: true,
            isLocalOnly: false,
            isMcpServer: true,
            toolCount: 40,
            tools: ['a', 'b'],
            verifiedAt: new Date().toISOString(),
          },
        ]}
      />
    );

    // Matches what the card and picker show for the same server.
    expect(screen.getByRole('button', { name: /Tool catalog/ })).toHaveTextContent('40 tools');

    fireEvent.click(screen.getByRole('button', { name: /Tool catalog/ }));
    expect(screen.getByText(/showing 2 of 40/)).toBeInTheDocument();
  });

  it('still lists a server whose tool names were never stored', () => {
    render(
      <McpToolCatalog
        servers={[
          {
            id: 'legacy',
            name: 'Legacy Server',
            connected: true,
            isLocalOnly: false,
            isMcpServer: true,
            toolCount: 4,
            tools: [],
            verifiedAt: new Date().toISOString(),
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Tool catalog/ }));

    // Counted, and not mistaken for a failed search.
    expect(screen.queryByText('No tools match that search.')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy Server')).toBeInTheDocument();
  });

  it("explains that only part of a large server's tool names are stored", () => {
    render(
      <McpToolCatalog
        servers={[
          {
            id: 'big',
            name: 'Big Server',
            connected: true,
            isLocalOnly: false,
            isMcpServer: true,
            toolCount: 200,
            tools: ['alpha'],
            verifiedAt: new Date().toISOString(),
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Tool catalog/ }));
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'omega' } });

    expect(
      screen.getByText(/Only the first tool names of each server are stored/)
    ).toBeInTheDocument();
  });
});
