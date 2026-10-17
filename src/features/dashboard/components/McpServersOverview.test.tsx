/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { McpServersOverview } from './McpServersOverview';
import type { McpServerOption } from '../../connections/hooks/useMcpServerOptions';

let mockOptions: McpServerOption[] = [];

vi.mock('../../connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => mockOptions,
  useMcpServerOptionsState: () => ({ options: mockOptions, isLoading: false }),
}));

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function renderCard() {
  render(
    <MemoryRouter>
      <McpServersOverview />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockOptions = [];
});

describe('McpServersOverview', () => {
  it('invites the user to connect a server when none are connected', () => {
    mockOptions = [
      {
        id: 'stateset-sync',
        name: 'StateSet Sync',
        isLocalOnly: false,
        isMcpServer: true,
        connected: false,
      },
    ];
    renderCard();

    expect(screen.getByText('No MCP servers connected yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Connect a server/ })).toHaveAttribute(
      'href',
      '/connections'
    );
  });

  it('counts connected, verified and stale servers', () => {
    mockOptions = [
      {
        id: 'a',
        name: 'A',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        verifiedAt: daysAgo(1),
        toolCount: 3,
      },
      {
        id: 'b',
        name: 'B',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        verifiedAt: daysAgo(40),
        toolCount: 9,
      },
      { id: 'c', name: 'C', isLocalOnly: false, isMcpServer: true, connected: true },
      { id: 'd', name: 'D', isLocalOnly: false, isMcpServer: true, connected: false },
    ];
    renderCard();

    expect(screen.getByTestId('mcp-connected')).toHaveTextContent('3');
    expect(screen.getByTestId('mcp-verified')).toHaveTextContent('1');
    expect(screen.getByTestId('mcp-needs-test')).toHaveTextContent('2');
  });

  it('reports the tools available across verified servers', () => {
    mockOptions = [
      {
        id: 'a',
        name: 'A',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        verifiedAt: daysAgo(1),
        toolCount: 3,
      },
      {
        id: 'b',
        name: 'B',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        verifiedAt: daysAgo(2),
        toolCount: 12,
      },
    ];
    renderCard();

    expect(screen.getByText('15 tools available')).toBeInTheDocument();
  });

  it('does not mention tools when nothing is verified', () => {
    mockOptions = [{ id: 'a', name: 'A', isLocalOnly: false, isMcpServer: true, connected: true }];
    renderCard();

    expect(screen.queryByText(/tools available/)).not.toBeInTheDocument();
  });

  it('uses the singular form for one tool', () => {
    mockOptions = [
      {
        id: 'a',
        name: 'A',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        verifiedAt: daysAgo(1),
        toolCount: 1,
      },
    ];
    renderCard();

    expect(screen.getByText('1 tool available')).toBeInTheDocument();
  });
});
