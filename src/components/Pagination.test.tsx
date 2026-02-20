/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('returns null when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows all pages when totalPages <= 5', () => {
    render(<Pagination currentPage={1} totalPages={4} onPageChange={vi.fn()} />);
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByRole('button', { name: `Go to page ${i}` })).toBeInTheDocument();
    }
    // No ellipsis
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('shows ellipsis when totalPages > 5', () => {
    render(<Pagination currentPage={5} totalPages={10} onPageChange={vi.fn()} />);
    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('disables Previous and First buttons on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Go to first page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  });

  it('disables Next and Last buttons on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to last page' })).toBeDisabled();
  });

  it('calls onPageChange with correct page number', () => {
    const onPageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 4' }));
    expect(onPageChange).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('shows item count when totalItems is provided', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={vi.fn()}
        totalItems={50}
        itemsPerPage={10}
      />
    );
    expect(screen.getByText('Showing 11-20 of 50')).toBeInTheDocument();
  });
});
