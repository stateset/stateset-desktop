import { memo, useMemo, useState, useRef } from 'react';
import clsx from 'clsx';

interface DataPoint {
  label: string;
  value: number;
}

interface ChartTooltipState {
  x: number;
  y: number;
  label: string;
  value: string;
}

function ChartTooltip({ tooltip }: { tooltip: ChartTooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none px-2.5 py-1.5 bg-gray-900/95 border border-gray-700/60 rounded-lg shadow-xl text-xs backdrop-blur-sm whitespace-nowrap"
      style={{ left: `${tooltip.x}%`, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
    >
      <p className="text-gray-400 text-[10px]">{tooltip.label}</p>
      <p className="text-gray-100 font-semibold">{tooltip.value}</p>
    </div>
  );
}

interface LineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  showLabels?: boolean;
  showGrid?: boolean;
  showArea?: boolean;
  className?: string;
}

export const LineChart = memo(function LineChart({
  data,
  height = 120,
  color = '#0ea5e9',
  showLabels = true,
  showGrid = true,
  showArea = true,
  className,
}: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { path, areaPath, points, maxValue, minValue } = useMemo(() => {
    if (data.length === 0) return { path: '', areaPath: '', points: [], maxValue: 0, minValue: 0 };

    const values = data.map((d) => d.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const padding = 20;
    const width = 100;
    const chartHeight = height - (showLabels ? 30 : 0);

    const pts = data.map((d, i) => ({
      x: padding + (i / (data.length - 1 || 1)) * (width - padding * 2),
      y: chartHeight - ((d.value - min) / range) * (chartHeight - padding),
      label: d.label,
      value: d.value,
    }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const area = `${linePath} L ${pts[pts.length - 1]?.x || 0} ${chartHeight} L ${pts[0]?.x || 0} ${chartHeight} Z`;

    return { path: linePath, areaPath: area, points: pts, maxValue: max, minValue: min };
  }, [data, height, showLabels]);

  const tooltip = useMemo<ChartTooltipState | null>(() => {
    if (hoveredIndex === null || !points[hoveredIndex]) return null;
    const pt = points[hoveredIndex];
    return { x: pt.x, y: pt.y - 8, label: pt.label, value: pt.value.toLocaleString() };
  }, [hoveredIndex, points]);

  if (data.length === 0) {
    return (
      <div
        className={clsx('flex items-center justify-center text-gray-500 text-sm', className)}
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <ChartTooltip tooltip={tooltip} />
      <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {showGrid && (
          <g className="text-gray-700">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y =
                height - (showLabels ? 30 : 0) - ratio * (height - (showLabels ? 30 : 0) - 20);
              return (
                <line
                  key={ratio}
                  x1="20"
                  y1={y}
                  x2="80"
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.3"
                  strokeDasharray="2,2"
                />
              );
            })}
          </g>
        )}

        {/* Area fill */}
        {showArea && areaPath && (
          <>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#areaGradient)" />
          </>
        )}

        {/* Line */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={hoveredIndex === i ? 3.5 : 2}
            fill={hoveredIndex === i ? 'white' : color}
            stroke={hoveredIndex === i ? color : 'none'}
            strokeWidth={hoveredIndex === i ? 1.5 : 0}
            className="transition-all duration-150 cursor-pointer"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}

        {/* Labels */}
        {showLabels && (
          <g className="text-gray-500" fontSize="3">
            {/* Y-axis labels */}
            <text x="2" y="15" fill="currentColor">
              {maxValue.toLocaleString()}
            </text>
            <text x="2" y={height - 30} fill="currentColor">
              {minValue.toLocaleString()}
            </text>

            {/* X-axis labels */}
            {points
              .filter(
                (_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)
              )
              .map((point, i) => (
                <text key={i} x={point.x} y={height - 5} fill="currentColor" textAnchor="middle">
                  {point.label}
                </text>
              ))}
          </g>
        )}
      </svg>
    </div>
  );
});

interface BarChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  showLabels?: boolean;
  className?: string;
}

export const BarChart = memo(function BarChart({
  data,
  height = 120,
  color = '#0ea5e9',
  showLabels = true,
  className,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { bars, maxValue } = useMemo(() => {
    if (data.length === 0) return { bars: [], maxValue: 0 };

    const values = data.map((d) => d.value);
    const max = Math.max(...values, 1);

    const barWidth = 80 / data.length;
    const gap = barWidth * 0.2;
    const actualBarWidth = barWidth - gap;

    const chartHeight = height - (showLabels ? 30 : 0);

    const computed = data.map((d, i) => ({
      x: 10 + i * barWidth + gap / 2,
      y: chartHeight - (d.value / max) * (chartHeight - 10),
      width: actualBarWidth,
      height: (d.value / max) * (chartHeight - 10),
      label: d.label,
      value: d.value,
    }));

    return { bars: computed, maxValue: max };
  }, [data, height, showLabels]);

  const tooltip = useMemo<ChartTooltipState | null>(() => {
    if (hoveredIndex === null || !bars[hoveredIndex]) return null;
    const bar = bars[hoveredIndex];
    return {
      x: bar.x + bar.width / 2,
      y: bar.y - 8,
      label: bar.label,
      value: bar.value.toLocaleString(),
    };
  }, [hoveredIndex, bars]);

  if (data.length === 0) {
    return (
      <div
        className={clsx('flex items-center justify-center text-gray-500 text-sm', className)}
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)}>
      <ChartTooltip tooltip={tooltip} />
      <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
        {/* Bars */}
        {bars.map((bar, i) => (
          <g key={i}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={color}
              fillOpacity={hoveredIndex === i ? 1 : 0.8}
              rx="1"
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />

            {/* Value label inside bar */}
            {bar.height > 15 && (
              <text
                x={bar.x + bar.width / 2}
                y={bar.y + 8}
                fill="white"
                fontSize="3"
                textAnchor="middle"
                className="pointer-events-none"
              >
                {bar.value.toLocaleString()}
              </text>
            )}
          </g>
        ))}

        {/* Labels */}
        {showLabels && (
          <g className="text-gray-500" fontSize="3">
            {/* Y-axis label */}
            <text x="2" y="10" fill="currentColor">
              {maxValue.toLocaleString()}
            </text>

            {/* X-axis labels */}
            {bars
              .filter((_, i) => data.length <= 7 || i % Math.ceil(data.length / 7) === 0)
              .map((bar, i) => (
                <text
                  key={i}
                  x={bar.x + bar.width / 2}
                  y={height - 5}
                  fill="currentColor"
                  textAnchor="middle"
                >
                  {bar.label}
                </text>
              ))}
          </g>
        )}
      </svg>
    </div>
  );
});

interface DonutChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  className?: string;
}

export const DonutChart = memo(function DonutChart({
  data,
  size = 120,
  thickness = 20,
  showLegend = true,
  className,
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { segments, total } = useMemo(() => {
    const sum = data.reduce((acc, d) => acc + d.value, 0);
    if (sum === 0) return { segments: [], total: 0 };

    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;

    let accumulated = 0;
    const segs = data.map((d) => {
      const percentage = d.value / sum;
      const offset = (accumulated / sum) * circumference;
      const length = percentage * circumference;
      accumulated += d.value;

      return {
        ...d,
        percentage,
        offset: circumference - offset,
        length,
        dashArray: `${length} ${circumference - length}`,
      };
    });

    return { segments: segs, total: sum };
  }, [data, size, thickness]);

  if (total === 0) {
    return (
      <div
        className={clsx('flex items-center justify-center text-gray-500 text-sm', className)}
        style={{ height: size }}
      >
        No data available
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const center = size / 2;

  return (
    <div className={clsx('flex items-center gap-4', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-gray-800"
        />

        {/* Segments */}
        {segments.map((segment, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={hoveredIndex === i ? thickness + 4 : thickness}
            strokeDasharray={segment.dashArray}
            strokeDashoffset={segment.offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            className="transition-all duration-200 cursor-pointer"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <title>{`${segment.label}: ${segment.value.toLocaleString()} (${(segment.percentage * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}

        {/* Center text */}
        <text
          x={center}
          y={hoveredIndex !== null ? center - 6 : center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-gray-200 font-semibold transition-all"
          fontSize="14"
        >
          {hoveredIndex !== null
            ? segments[hoveredIndex]?.value.toLocaleString()
            : total.toLocaleString()}
        </text>
        {hoveredIndex !== null && segments[hoveredIndex] && (
          <text
            x={center}
            y={center + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-gray-400"
            fontSize="8"
          >
            {segments[hoveredIndex].label}
          </text>
        )}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="space-y-2">
          {segments.map((segment, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-center gap-2 text-sm rounded-lg px-2 py-1 -mx-2 transition-all duration-150 cursor-pointer',
                hoveredIndex === i ? 'bg-slate-800/60 scale-[1.02]' : 'hover:bg-slate-800/40'
              )}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className={clsx(
                  'w-3 h-3 rounded-full shadow-sm transition-transform',
                  hoveredIndex === i && 'scale-125'
                )}
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-gray-400">{segment.label}</span>
              <span className="text-gray-200 font-medium">
                {(segment.percentage * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

interface StatCardProps {
  label: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon?: React.ElementType;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  className?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  change,
  changeLabel,
  icon: Icon,
  color = 'blue',
  className,
}: StatCardProps) {
  const colorClasses = {
    blue: 'bg-gradient-to-br from-blue-900/40 to-blue-900/15 text-blue-400 border border-blue-500/15 shadow-inner shadow-blue-500/5',
    green:
      'bg-gradient-to-br from-green-900/40 to-green-900/15 text-green-400 border border-green-500/15 shadow-inner shadow-green-500/5',
    amber:
      'bg-gradient-to-br from-amber-900/40 to-amber-900/15 text-amber-400 border border-amber-500/15 shadow-inner shadow-amber-500/5',
    purple:
      'bg-gradient-to-br from-purple-900/40 to-purple-900/15 text-purple-400 border border-purple-500/15 shadow-inner shadow-purple-500/5',
    red: 'bg-gradient-to-br from-red-900/40 to-red-900/15 text-red-400 border border-red-500/15 shadow-inner shadow-red-500/5',
  };

  return (
    <div
      className={clsx(
        'bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/50 transition-all duration-200',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-2xl font-bold mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {change !== undefined && (
            <p
              className={clsx(
                'text-sm mt-1 flex items-center gap-1',
                change >= 0 ? 'text-green-400' : 'text-red-400'
              )}
            >
              {change >= 0 ? '+' : ''}
              {change}%{changeLabel && <span className="text-gray-500">{changeLabel}</span>}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              colorClasses[color]
            )}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
});
