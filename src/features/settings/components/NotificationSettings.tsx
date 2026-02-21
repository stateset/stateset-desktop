import { Bell, ShieldAlert } from 'lucide-react';
import { usePreferencesStore } from '../../../stores/preferences';

export function NotificationSettings() {
  const {
    desktopNotifications,
    soundAlerts,
    telemetryEnabled,
    setDesktopNotifications,
    setSoundAlerts,
    setTelemetryEnabled,
  } = usePreferencesStore();

  return (
    <>
      <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
        <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
          <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-gray-400" />
            Notifications
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Desktop Notifications</p>
              <p className="text-sm text-gray-400">Get notified when agents need attention</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer focus:outline-none focus-visible:ring-0"
                aria-label="Desktop Notifications"
                checked={desktopNotifications}
                onChange={(e) => setDesktopNotifications(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:shadow-md peer-checked:shadow-brand-500/30 transition-shadow duration-200"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sound Alerts</p>
              <p className="text-sm text-gray-400">Play sounds for important events</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer focus:outline-none focus-visible:ring-0"
                aria-label="Sound Alerts"
                checked={soundAlerts}
                onChange={(e) => setSoundAlerts(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:shadow-md peer-checked:shadow-brand-500/30 transition-shadow duration-200"></div>
            </label>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
        <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
          <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-gray-400" />
            Privacy
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Share anonymous usage data</p>
              <p className="text-sm text-gray-400">
                Help improve StateSet by sending anonymized telemetry. Opt-in only.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer focus:outline-none focus-visible:ring-0"
                aria-label="Share anonymous usage data"
                checked={telemetryEnabled}
                onChange={(e) => setTelemetryEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 peer-checked:shadow-md peer-checked:shadow-brand-500/30 transition-shadow duration-200"></div>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            We never collect API keys, message content, or personal data.
          </p>
        </div>
      </section>
    </>
  );
}
