/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { subDays, format } from 'date-fns';
import { DateRangePicker } from './DateRangePicker';

function makeRange(days: number) {
  const end = new Date();
  return { start: subDays(end, days - 1), end };
}

describe('DateRangePicker', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the matching preset label on the trigger', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Open date range picker' })).toHaveTextContent(
      'Last 7 days'
    );
  });

  it('shows a formatted custom range when no preset matches', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 5);
    render(<DateRangePicker value={{ start, end }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Open date range picker' })).toHaveTextContent(
      `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
    );
  });

  it('opens a listbox of presets on click', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Open date range picker' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: 'Date range presets' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('marks the active preset as selected', () => {
    render(<DateRangePicker value={makeRange(30)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open date range picker' }));
    expect(screen.getByRole('option', { name: 'Last 30 days' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('selects a preset, emits the new range, and closes', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open date range picker' }));
    fireEvent.click(screen.getByRole('option', { name: 'Last 14 days' }));

    expect(onChange).toHaveBeenCalledOnce();
    const range = onChange.mock.calls[0][0] as { start: Date; end: Date };
    const days = Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(13);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape without selecting', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open date range picker' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when clicking outside', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open date range picker' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('toggles closed when clicking the trigger again', () => {
    render(<DateRangePicker value={makeRange(7)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Open date range picker' });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
