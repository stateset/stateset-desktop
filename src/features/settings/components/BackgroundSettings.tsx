import { Monitor } from 'lucide-react';
import { usePreferencesStore } from '../../../stores/preferences';

export function BackgroundSettings() {
  const { minimizeToTray, autoStartAgentsOnLaunch, setMinimizeToTray, setAutoStartAgentsOnLaunch } =
    usePreferencesStore();

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold flex items-center gap-2">
          <Monitor className="w-5 h-5 text-gray-400" />
          Background Mode
        </h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Minimize to System Tray</p>
            <p className="text-sm text-gray-400">Keep agents running when you close the window</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer focus:outline-none focus-visible:ring-0"
              aria-label="Minimize to System Tray"
              checked={minimizeToTray}
              onChange={(e) => setMinimizeToTray(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Auto-start Agents on Launch</p>
            <p className="text-sm text-gray-400">
              Restart agents that were running when you last closed the app
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer focus:outline-none focus-visible:ring-0"
              aria-label="Auto-start Agents on Launch"
              checked={autoStartAgentsOnLaunch}
              onChange={(e) => setAutoStartAgentsOnLaunch(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          When enabled, closing the window will minimize StateSet to the system tray instead of
          quitting. Your AI agents will continue running in the background.
        </p>
      </div>
    </section>
  );
}
