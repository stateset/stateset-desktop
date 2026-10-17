/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LogsViewer, type LogEntry } from './LogsViewer';

const logs: LogEntry[] = [
  { id: '1', timestamp: 1700000000000, level: 'info', message: 'Agent started', source: 'agent' },
  { id: '2', timestamp: 1700000001000, level: 'warn', message: 'Slow response detected' },
  {
    id: '3',
    timestamp: 1700000002000,
    level: 'error',
    message: 'Request failed',
    source: 'api',
    details: { statusCode: 500 },
  },
  { id: '4', timestamp: 1700000003000, level: 'debug', message: 'Payload trace' },
];

describe('LogsViewer', () => {
  beforeAll(() => {
    // happy-dom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and log count', () => {
    render(<LogsViewer logs={logs} title="Agent Logs" />);
    expect(screen.getByText('Agent Logs')).toBeInTheDocument();
    expect(screen.getByText('4 / 4 logs')).toBeInTheDocument();
  });

  it('renders log messages inside an accessible log region', () => {
    render(<LogsViewer logs={logs} />);
    const region = screen.getByRole('log', { name: 'Logs' });
    expect(within(region).getByText('Agent started')).toBeInTheDocument();
    expect(within(region).getByText('Request failed')).toBeInTheDocument();
  });

  it('shows an empty state when there are no logs', () => {
    render(<LogsViewer logs={[]} />);
    expect(screen.getByText('No logs to display')).toBeInTheDocument();
  });

  it('toggles the filter panel with aria-expanded', () => {
    render(<LogsViewer logs={logs} />);
    const filterButton = screen.getByRole('button', { name: 'Show log filters' });
    expect(filterButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(filterButton);
    expect(screen.getByRole('button', { name: 'Hide log filters' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByLabelText('Search logs')).toBeInTheDocument();
  });

  it('filters logs by search term', () => {
    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show log filters' }));
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'failed' } });

    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.queryByText('Agent started')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 4 logs')).toBeInTheDocument();
  });

  it('matches the search term against the source', () => {
    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show log filters' }));
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'agent' } });
    expect(screen.getByText('Agent started')).toBeInTheDocument();
    expect(screen.queryByText('Slow response detected')).not.toBeInTheDocument();
  });

  it('clears the search term', () => {
    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show log filters' }));
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'failed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search term' }));
    expect(screen.getByText('4 / 4 logs')).toBeInTheDocument();
  });

  it('filters logs by level with pressed-state buttons', () => {
    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show log filters' }));

    const errorToggle = screen.getByRole('button', { name: 'Toggle error logs' });
    expect(errorToggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(errorToggle);
    expect(errorToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Request failed')).not.toBeInTheDocument();
    expect(screen.getByText('3 / 4 logs')).toBeInTheDocument();
  });

  it('expands log details via click', () => {
    render(<LogsViewer logs={logs} />);
    expect(screen.queryByText(/statusCode/)).not.toBeInTheDocument();

    const row = screen.getByRole('button', { expanded: false, name: /Request failed/ });
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/statusCode/)).toBeInTheDocument();
  });

  it('toggles log details with the keyboard', () => {
    render(<LogsViewer logs={logs} />);
    const row = screen.getByRole('button', { name: /Request failed/ });
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText(/statusCode/)).toBeInTheDocument();

    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.queryByText(/statusCode/)).not.toBeInTheDocument();
  });

  it('does not make rows without details interactive', () => {
    render(<LogsViewer logs={logs} />);
    expect(screen.queryByRole('button', { name: /Agent started/ })).not.toBeInTheDocument();
  });

  it('calls a custom onExport handler instead of opening the menu', () => {
    const onExport = vi.fn();
    render(<LogsViewer logs={logs} onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show export options' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens an export menu with format options', () => {
    render(<LogsViewer logs={logs} />);
    const exportButton = screen.getByRole('button', { name: 'Show export options' });
    expect(exportButton).toHaveAttribute('aria-haspopup', 'menu');

    fireEvent.click(exportButton);
    const menu = screen.getByRole('menu', { name: 'Export format' });
    expect(within(menu).getByRole('menuitem', { name: 'Plain Text' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'JSON' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'CSV' })).toBeInTheDocument();
  });

  it('closes the export menu on Escape', () => {
    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show export options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('downloads the selected format and closes the menu', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<LogsViewer logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show export options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'JSON' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('shows the clear button only when onClear is provided', () => {
    const onClear = vi.fn();
    const { rerender } = render(<LogsViewer logs={logs} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear logs' }));
    expect(onClear).toHaveBeenCalledOnce();

    rerender(<LogsViewer logs={logs} />);
    expect(screen.queryByRole('button', { name: 'Clear logs' })).not.toBeInTheDocument();
  });
});
