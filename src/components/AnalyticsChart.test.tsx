/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { LineChart, BarChart, DonutChart, StatCard } from './AnalyticsChart';

const lineData = [
  { label: 'Mon', value: 10 },
  { label: 'Tue', value: 25 },
  { label: 'Wed', value: 15 },
];

describe('LineChart', () => {
  it('renders an accessible chart image', () => {
    render(<LineChart data={lineData} />);
    expect(screen.getByRole('img', { name: 'Line chart' })).toBeInTheDocument();
  });

  it('uses a custom aria label when provided', () => {
    render(<LineChart data={lineData} ariaLabel="Sessions over time" />);
    expect(screen.getByRole('img', { name: 'Sessions over time' })).toBeInTheDocument();
  });

  it('shows an empty state when there is no data', () => {
    render(<LineChart data={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data available');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders min and max axis labels', () => {
    render(<LineChart data={lineData} />);
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders x-axis labels for first and last points', () => {
    render(<LineChart data={lineData} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
  });

  it('hides labels when showLabels is false', () => {
    render(<LineChart data={lineData} showLabels={false} />);
    expect(screen.queryByText('Mon')).not.toBeInTheDocument();
  });
});

describe('BarChart', () => {
  it('renders an accessible chart image', () => {
    render(<BarChart data={lineData} />);
    expect(screen.getByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
  });

  it('shows an empty state when there is no data', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data available');
  });

  it('renders bar labels on the x-axis', () => {
    render(<BarChart data={lineData} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
  });

  it('renders the max value as the y-axis label', () => {
    render(<BarChart data={lineData} />);
    expect(screen.getAllByText('25').length).toBeGreaterThan(0);
  });
});

describe('DonutChart', () => {
  const donutData = [
    { label: 'Active', value: 60, color: '#22c55e' },
    { label: 'Idle', value: 40, color: '#f59e0b' },
  ];

  it('renders an accessible chart image with legend', () => {
    render(<DonutChart data={donutData} />);
    expect(screen.getByRole('img', { name: 'Donut chart' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('shows percentage breakdown in the legend', () => {
    render(<DonutChart data={donutData} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows the total in the center', () => {
    render(<DonutChart data={donutData} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('hides the legend when showLegend is false', () => {
    render(<DonutChart data={donutData} showLegend={false} />);
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
  });

  it('shows an empty state when all values are zero', () => {
    render(<DonutChart data={[{ label: 'None', value: 0, color: '#888' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data available');
  });

  it('shows an empty state for an empty array', () => {
    render(<DonutChart data={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data available');
  });
});

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Sessions" value={42} />);
    expect(screen.getByText('Total Sessions')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats large numeric values with locale separators', () => {
    render(<StatCard label="Requests" value={1234567} />);
    expect(screen.getByText((1234567).toLocaleString())).toBeInTheDocument();
  });

  it('renders string values as-is', () => {
    render(<StatCard label="Uptime" value="99.9%" />);
    expect(screen.getByText('99.9%')).toBeInTheDocument();
  });

  it('shows positive change with a plus sign', () => {
    render(<StatCard label="Growth" value={10} change={12} />);
    expect(screen.getByText(/\+12%/)).toBeInTheDocument();
  });

  it('shows negative change without a plus sign', () => {
    render(<StatCard label="Growth" value={10} change={-5} />);
    expect(screen.getByText(/-5%/)).toBeInTheDocument();
  });

  it('renders the change label when provided', () => {
    render(<StatCard label="Growth" value={10} change={3} changeLabel="vs last week" />);
    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });

  it('does not render a change row when change is undefined', () => {
    render(<StatCard label="Growth" value={10} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    const { container } = render(<StatCard label="Activity" value={1} icon={Activity} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
