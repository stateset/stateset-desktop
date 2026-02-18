import { memo, useMemo } from 'react';
import clsx from 'clsx';

interface SparklineProps {
  /** Data points to display */
  data: number[];
  /** Width of the chart */
  width?: number;
  /** Height of the chart */
  height?: number;
  /** Line color */
  color?: string;
  /** Show gradient fill under the line */
  showFill?: boolean;
  /** Show dots at data points */
  showDots?: boolean;
  /** Minimum value (for consistent scaling) */
  min?: number;
  /** Maximum value (for consistent scaling) */
  max?: number;
  /** Additional className */
  className?: string;
}

/**
 * Simple SVG sparkline chart component
 * Perfect for inline metrics visualization
 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 100,
  height = 32,
  color = '#8B5CF6',
  showFill = true,
  showDots = false,
  min: minProp,
  max: maxProp,
  className,
}: SparklineProps) {
  const { path, fillPath, points } = useMemo(() => {
    if (data.length < 2) {
      return { path: '', fillPath: '', points: [] };
    }

    const minVal = minProp ?? Math.min(...data);
    const maxVal = maxProp ?? Math.max(...data);
    const range = maxVal - minVal || 1;

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - minVal) / range) * chartHeight;
      return { x, y, value };
    });

    // Create smooth curve using cubic bezier
    const path = points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x},${point.y}`;
      }

      const prev = points[index - 1];
      const cp1x = prev.x + (point.x - prev.x) / 3;
      const cp1y = prev.y;
      const cp2x = point.x - (point.x - prev.x) / 3;
      const cp2y = point.y;

      return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
    }, '');

    // Create fill path (same as line but closed at bottom)
    const fillPath = `${path} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;

    return { path, fillPath, points };
  }, [data, width, height, minProp, maxProp]);

  if (data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={clsx('inline-block', className)}
        aria-label="No data available"
      >
        <line
          x1={4}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </svg>
    );
  }

  const gradientId = `sparkline-gradient-${color.replace('#', '')}`;

  return (
    <svg
      width={width}
      height={height}
      className={clsx('inline-block', className)}
      aria-label={`Sparkline chart with ${data.length} data points`}
    >
      {showFill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots &&
        points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={2} fill={color} />
        ))}
    </svg>
  );
});

interface SparklineBarProps {
  /** Data points to display */
  data: number[];
  /** Width of the chart */
  width?: number;
  /** Height of the chart */
  height?: number;
  /** Bar color */
  color?: string;
  /** Gap between bars */
  gap?: number;
  /** Additional className */
  className?: string;
}

/**
 * Bar chart variant of sparkline
 * Good for discrete values like counts
 */
export const SparklineBar = memo(function SparklineBar({
  data,
  width = 100,
  height = 32,
  color = '#8B5CF6',
  gap = 2,
  className,
}: SparklineBarProps) {
  const bars = useMemo(() => {
    if (data.length === 0) return [];

    const maxVal = Math.max(...data) || 1;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = (chartWidth - gap * (data.length - 1)) / data.length;

    return data.map((value, index) => {
      const barHeight = (value / maxVal) * chartHeight;
      const x = padding + index * (barWidth + gap);
      const y = padding + chartHeight - barHeight;

      return { x, y, width: barWidth, height: barHeight, value };
    });
  }, [data, width, height, gap]);

  if (data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={clsx('inline-block', className)}
        aria-label="No data available"
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className={clsx('inline-block', className)}
      aria-label={`Bar chart with ${data.length} data points`}
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          fill={color}
          rx={1}
          opacity={0.8}
        />
      ))}
    </svg>
  );
});
