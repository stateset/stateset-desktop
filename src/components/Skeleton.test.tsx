/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonLoader, SkeletonCard, SkeletonTable, SkeletonMetric } from './Skeleton';

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses text variant defaults (full width, 1em height, rounded-md)', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('rounded-md');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1em');
  });

  it('applies circular and rectangular variant classes', () => {
    const { container, rerender } = render(<Skeleton variant="circular" />);
    expect((container.firstChild as HTMLElement).className).toContain('rounded-full');

    rerender(<Skeleton variant="rectangular" />);
    expect((container.firstChild as HTMLElement).className).toContain('rounded-xl');
  });

  it('applies numeric width and height as pixel styles', () => {
    const { container } = render(<Skeleton width={48} height={20} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('48px');
    expect(el.style.height).toBe('20px');
  });

  it('pulses by default and stops when animate is false', () => {
    const { container, rerender } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain('animate-pulse');

    rerender(<Skeleton animate={false} />);
    expect((container.firstChild as HTMLElement).className).not.toContain('animate-pulse');
  });

  it('renders a shimmer overlay instead of pulse when shimmer is set', () => {
    const { container } = render(<Skeleton shimmer />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toContain('animate-pulse');
    expect(el.querySelector('div')).not.toBeNull();
  });
});

describe('SkeletonLoader', () => {
  it('shows skeleton while loading and children when loaded', () => {
    const { container, rerender, getByText } = render(
      <SkeletonLoader loading skeleton={<Skeleton />}>
        <p>Loaded content</p>
      </SkeletonLoader>
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Loaded content');

    rerender(
      <SkeletonLoader loading={false} skeleton={<Skeleton />}>
        <p>Loaded content</p>
      </SkeletonLoader>
    );
    expect(getByText('Loaded content')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('SkeletonCard', () => {
  it('renders a decorative placeholder hidden from assistive technology', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SkeletonTable', () => {
  it('renders the default number of rows hidden from assistive technology', () => {
    const { container } = render(<SkeletonTable />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.children).toHaveLength(5);
  });

  it('renders a custom number of rows', () => {
    const { container } = render(<SkeletonTable rows={3} />);
    expect((container.firstChild as HTMLElement).children).toHaveLength(3);
  });
});

describe('SkeletonMetric', () => {
  it('renders a decorative placeholder hidden from assistive technology', () => {
    const { container } = render(<SkeletonMetric />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
