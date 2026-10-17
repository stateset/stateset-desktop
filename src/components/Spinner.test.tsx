/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders with role status and an accessible loading label', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('renders screen-reader-only loading text', () => {
    render(<Spinner />);
    const srText = screen.getByText('Loading...');
    expect(srText).toHaveClass('sr-only');
  });

  it('announces paused state and stops animating when paused', () => {
    render(<Spinner paused />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Paused');
    expect(spinner.className).not.toContain('animate-spin');
    expect(screen.getByText('Paused')).toHaveClass('sr-only');
  });

  it('animates by default', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').className).toContain('animate-spin');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Spinner size="sm" />);
    expect(screen.getByRole('status').className).toContain('w-4');

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole('status').className).toContain('w-6');
  });

  it('applies custom color and className', () => {
    render(<Spinner color="border-t-emerald-400" className="custom-class" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('border-t-emerald-400');
    expect(spinner.className).toContain('custom-class');
  });
});
