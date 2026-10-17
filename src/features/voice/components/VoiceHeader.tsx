import { RotateCcw, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import { VOICE_SETTINGS_PANEL_ID } from '../constants';

interface VoiceHeaderProps {
  statusLabel: string;
  isConnected: boolean;
  isConnecting: boolean;
  isProvisioningSession: boolean;
  showSettings: boolean;
  hasApiKey: boolean;
  onToggleSettings: () => void;
  onResetSession: () => void;
}

export function VoiceHeader({
  statusLabel,
  isConnected,
  isConnecting,
  isProvisioningSession,
  showSettings,
  hasApiKey,
  onToggleSettings,
  onResetSession,
}: VoiceHeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 shrink-0">
      <span
        role="status"
        aria-live="polite"
        className={clsx(
          'inline-flex items-center gap-2 text-xs font-medium',
          isConnected ? 'text-emerald-400' : 'text-slate-400'
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'w-2 h-2 rounded-full shrink-0',
            isConnected
              ? 'bg-emerald-400'
              : isConnecting || isProvisioningSession
                ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-500'
          )}
        />
        {statusLabel}
      </span>

      <h1 className="text-sm font-semibold text-gray-200">Voice</h1>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSettings}
          className={clsx(
            'relative rounded-lg p-1.5 transition-colors',
            showSettings
              ? 'bg-slate-700/60 text-brand-300'
              : 'text-slate-400 hover:text-gray-200 hover:bg-slate-800/60'
          )}
          aria-label="Toggle settings"
          aria-expanded={showSettings}
          aria-controls={VOICE_SETTINGS_PANEL_ID}
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
          {!hasApiKey && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border border-slate-900"
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          onClick={onResetSession}
          className="rounded-lg p-1.5 text-slate-400 hover:text-gray-200 hover:bg-slate-800/60 transition-colors"
          aria-label="Reset session"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
