/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { McpServerStatusNotice } from './McpServerStatusNotice';
import type { McpServerOption } from '../hooks/useMcpServerOptions';

let mockOptions: McpServerOption[] = [];
let mockIsLoading = false;

vi.mock('../hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => mockOptions,
  useMcpServerOptionsState: () => ({ options: mockOptions, isLoading: mockIsLoading }),
}));

function renderNotice(servers: string[]) {
  render(
    <MemoryRouter>
      <McpServerStatusNotice servers={servers} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockIsLoading = false;
  mockOptions = [
    { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
    { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
    {
      id: 'stateset-sync',
      name: 'StateSet Sync',
      isLocalOnly: false,
      isMcpServer: true,
      connected: false,
    },
  ];
});

describe('McpServerStatusNotice', () => {
  it('says nothing when the agent uses no servers', () => {
    const { container } = render(
      <MemoryRouter>
        <McpServerStatusNotice servers={[]} />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('says nothing when every server is connected', () => {
    renderNotice(['shopify']);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the servers the agent cannot reach', () => {
    renderNotice(['shopify', 'gorgias', 'stateset-sync']);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Gorgias');
    expect(alert).toHaveTextContent('StateSet Sync');
    expect(alert).not.toHaveTextContent('Shopify');
  });

  it('falls back to the raw id for a server it knows nothing about', () => {
    renderNotice(['mystery-server']);

    expect(screen.getByRole('alert')).toHaveTextContent('mystery-server');
  });

  it('links to the connections page', () => {
    renderNotice(['gorgias']);

    expect(screen.getByRole('link', { name: /Connections/ })).toHaveAttribute(
      'href',
      '/connections'
    );
  });

  it('uses singular wording for one server', () => {
    renderNotice(['gorgias']);

    expect(screen.getByRole('alert')).toHaveTextContent('This agent uses an MCP server');
  });

  it('uses plural wording for several servers', () => {
    renderNotice(['gorgias', 'stateset-sync']);

    expect(screen.getByRole('alert')).toHaveTextContent('This agent uses MCP servers');
  });

  it('explains that a local-only server cannot be reached, without sending the user to Connections', () => {
    renderNotice(['stateset-nsr']);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('StateSet NSR runs as a local MCP server');
    expect(alert).not.toHaveTextContent('without stored credentials');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('reports missing credentials and local-only servers separately', () => {
    renderNotice(['gorgias', 'stateset-edi']);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('without stored credentials');
    expect(alert).toHaveTextContent('Gorgias');
    expect(alert).toHaveTextContent('StateSet EDI runs as a local MCP server');
  });

  it('says nothing until the connections query settles', () => {
    mockIsLoading = true;

    renderNotice(['gorgias']);

    // Everything looks unconnected while loading; warning then would be a lie.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns that device-only credentials are invisible to a hosted agent', () => {
    mockOptions = [
      { id: 'my-mcp', name: 'my-mcp', connected: true, isLocalOnly: true, isMcpServer: true },
    ];

    renderNotice(['my-mcp']);

    expect(screen.getByRole('alert')).toHaveTextContent('stored on this device only');
  });
});
