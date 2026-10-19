import { SettingsToggle } from './SettingsToggle';
import { Monitor } from 'lucide-react';
import { usePreferencesStore } from '../../../stores/preferences';
import { DurableWorkflowSettings } from './DurableWorkflowSettings';

export function BackgroundSettings() {
  const { minimizeToTray, autoStartAgentsOnLaunch, setMinimizeToTray, setAutoStartAgentsOnLaunch } =
    usePreferencesStore();

  return (
    <div className="space-y-5">
      <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
        <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
          <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-gray-400" />
            Background Mode
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <SettingsToggle
            label="Minimize to System Tray"
            description="Keep agents running when you close the window"
            checked={minimizeToTray}
            onChange={setMinimizeToTray}
          />
          <SettingsToggle
            label="Auto-start Agents on Launch"
            description="Restart agents that were running when you last closed the app"
            checked={autoStartAgentsOnLaunch}
            onChange={setAutoStartAgentsOnLaunch}
          />
          <p className="text-xs text-gray-500">
            When enabled, closing the window will minimize StateSet to the system tray instead of
            quitting. Your AI agents will continue running in the background.
          </p>
        </div>
      </section>
      <DurableWorkflowSettings />
    </div>
  );
}
