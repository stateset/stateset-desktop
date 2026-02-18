/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, StatusDot } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('has role="status"', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders all statuses', () => {
    const statuses = ['starting', 'running', 'paused', 'stopping', 'stopped', 'failed'] as const;
    for (const status of statuses) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows icon when showIcon is true', () => {
    const { container } = render(<StatusBadge status="running" showIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('hides icon by default', () => {
    const { container } = render(<StatusBadge status="running" />);
    // No SVG icon expected since showIcon defaults to false
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(0);
  });
});

describe('StatusDot', () => {
  it('has aria-label with status text', () => {
    render(<StatusDot status="running" />);
    const dot = screen.getByLabelText(/status: running/i);
    expect(dot).toBeInTheDocument();
  });

  it('shows pulse for running status', () => {
    const { container } = render(<StatusDot status="running" />);
    const pulseSpan = container.querySelector('.animate-ping');
    expect(pulseSpan).toBeInTheDocument();
  });

  it('does not show pulse for stopped status', () => {
    const { container } = render(<StatusDot status="stopped" />);
    const pulseSpan = container.querySelector('.animate-ping');
    expect(pulseSpan).not.toBeInTheDocument();
  });
});
