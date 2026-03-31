import { useCallback, useRef } from 'react';
import { Bell, ShieldAlert, Volume2 } from 'lucide-react';
import { usePreferencesStore } from '../../../stores/preferences';

function useTestSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      /* Audio API may not be available */
    }
  }, []);
}

export function NotificationSettings() {
  const {
    desktopNotifications,
    soundAlerts,
    telemetryEnabled,
    setDesktopNotifications,
    setSoundAlerts,
    setTelemetryEnabled,
  } = usePreferencesStore();
  const playTestSound = useTestSound();

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={playTestSound}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 rounded-lg transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                title="Play test sound"
                aria-label="Play test notification sound"
              >
                <Volume2 className="w-3 h-3" aria-hidden="true" />
                Test
              </button>
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
