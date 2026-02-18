interface QuickConfigBarProps {
  model: string;
  temperature: number;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temperature: number) => void;
}

export function QuickConfigBar({
  model,
  temperature,
  onModelChange,
  onTemperatureChange,
}: QuickConfigBarProps) {
  return (
    <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-4 text-xs">
      <label className="flex items-center gap-2">
        <span className="text-gray-500">Model:</span>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-brand-500"
        >
          <option value="claude-sonnet-4-6">Sonnet 4.6</option>
          <option value="claude-opus-4-20250514">Opus 4</option>
          <option value="claude-3-5-sonnet-20241022">Sonnet 3.5</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-gray-500">Temp:</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          className="w-20 accent-brand-500"
        />
        <span className="text-gray-400 w-6 text-right">{temperature.toFixed(1)}</span>
      </label>
    </div>
  );
}
