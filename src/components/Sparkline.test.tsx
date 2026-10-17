/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline, SparklineBar } from './Sparkline';

describe('Sparkline', () => {
  const data = [1, 5, 3, 8, 4];

  it('renders an svg with role img and a descriptive label', () => {
    render(<Sparkline data={data} />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', 'Sparkline chart with 5 data points');
  });

  it('renders a line path and a gradient fill by default', () => {
    const { container } = render(<Sparkline data={data} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('linearGradient')).not.toBeNull();
  });

  it('renders only the line path when showFill is false', () => {
    const { container } = render(<Sparkline data={data} showFill={false} />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(container.querySelector('linearGradient')).toBeNull();
  });

  it('renders an accessible placeholder when there are fewer than 2 points', () => {
    render(<Sparkline data={[42]} />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', 'No data available');
  });

  it('renders a dot for each data point when showDots is set', () => {
    const { container } = render(<Sparkline data={data} showDots showFill={false} />);
    expect(container.querySelectorAll('circle')).toHaveLength(data.length);
  });

  it('renders end dot markers when showEndDot is set', () => {
    const { container } = render(<Sparkline data={data} showEndDot showFill={false} />);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('stretches via viewBox when responsive', () => {
    render(<Sparkline data={data} responsive width={120} height={40} />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('width', '100%');
    expect(chart).toHaveAttribute('viewBox', '0 0 120 40');
  });
});

describe('SparklineBar', () => {
  it('renders a bar for each data point with an accessible label', () => {
    const { container } = render(<SparklineBar data={[1, 2, 3]} />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', 'Bar chart with 3 data points');
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });

  it('renders an accessible empty placeholder when data is empty', () => {
    const { container } = render(<SparklineBar data={[]} />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', 'No data available');
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });
});
