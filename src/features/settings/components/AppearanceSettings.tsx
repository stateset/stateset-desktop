import { Palette } from 'lucide-react';
import {
  usePreferencesStore,
  type RefreshInterval,
  type PageSize,
} from '../../../stores/preferences';

const REFRESH_INTERVAL_OPTIONS: Array<{ value: RefreshInterval; label: string }> = [
  { value: 5000, label: 'Every 5 seconds' },
  { value: 10000, label: 'Every 10 seconds' },
  { value: 30000, label: 'Every 30 seconds' },
  { value: 60000, label: 'Every 60 seconds' },
];

const PAGE_SIZE_OPTIONS: PageSize[] = [10, 25, 50, 100];

export function AppearanceSettings() {
  const {
    theme,
    reduceMotion,
    compactMode,
    refreshInterval,
    pageSize,
    setTheme,
    setReduceMotion,
    setCompactMode,
    setRefreshInterval,
    setPageSize,
  } = usePreferencesStore();

  return (
    <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
        <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
          <Palette className="w-5 h-5 text-gray-400" />
          Preferences
        </h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm text-gray-400">Choose your preferred theme</p>
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
            aria-label="Theme"
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Compact Mode</p>
            <p className="text-sm text-gray-400">Reduce spacing and overall scale</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer focus:outline-none focus-visible:ring-0"
              aria-label="Compact Mode"
              checked={compactMode}
              onChange={(e) => setCompactMode(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:shadow-md peer-checked:shadow-brand-500/30 transition-shadow duration-200"></div>
          </label>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Reduce Motion</p>
            <p className="text-sm text-gray-400">Limit animations and transitions</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer focus:outline-none focus-visible:ring-0"
              aria-label="Reduce Motion"
              checked={reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:shadow-md peer-checked:shadow-brand-500/30 transition-shadow duration-200"></div>
          </label>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Refresh Interval</p>
            <p className="text-sm text-gray-400">How often to refresh data</p>
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value) as RefreshInterval)}
            aria-label="Refresh Interval"
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
          >
            {REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Page Size</p>
            <p className="text-sm text-gray-400">Sessions per page in tables</p>
          </div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            aria-label="Page Size"
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
