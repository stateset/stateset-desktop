import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Bot,
  Loader2,
  Settings,
  Copy,
  Download,
  Search,
  FileText,
  Save,
} from 'lucide-react';
import clsx from 'clsx';

interface AgentToolbarProps {
  session: { id: string; agent_type: string; name?: string | null; config?: unknown };
  isConnected: boolean;
  isConnecting: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isCloning: boolean;
  isPausing: boolean;
  isStopping: boolean;
  showSearch: boolean;
  showLogs: boolean;
  showStartStreamCta: boolean;
  isStartStreamPending: boolean;
  startStreamLabel: string;
  onBack: () => void;
  onToggleSearch: () => void;
  onExport: () => void;
  onClone: () => void;
  onSaveTemplate: () => void;
  onToggleLogs: () => void;
  onOpenConfig: () => void;
  onStartAndStream: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function AgentToolbar({
  session,
  isConnected,
  isConnecting,
  isRunning,
  isPaused,
  isStopped: _isStopped,
  isCloning,
  isPausing,
  isStopping,
  showSearch,
  showLogs,
  showStartStreamCta,
  isStartStreamPending,
  startStreamLabel,
  onBack,
  onToggleSearch,
  onExport,
  onClone,
  onSaveTemplate,
  onToggleLogs,
  onOpenConfig,
  onStartAndStream,
  onPause,
  onStop,
}: AgentToolbarProps) {
  return (
    <div className="glass-header flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700/45">
      <div className="min-w-0 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-slate-800/70 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div
              className={clsx(
                'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900',
                isRunning && 'bg-green-500 animate-pulse',
                isPaused && 'bg-amber-500',
                !isRunning && !isPaused && 'bg-gray-500'
              )}
            />
          </div>
          <div>
            <h1 className="font-semibold text-slate-100 truncate">
              {session.name?.trim()
                ? session.name
                : `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} Agent`}
            </h1>
            <p className="text-sm text-slate-400">
              {session.name?.trim()
                ? `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} \u2022 `
                : ''}
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={onToggleSearch}
          aria-pressed={showSearch}
          className={clsx(
            'p-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
            showSearch ? 'bg-brand-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
          )}
          title="Search in conversation (Ctrl/Cmd+F)"
          aria-label="Search in conversation"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onExport}
          className="p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          title="Export conversation (Ctrl/Cmd+E)"
          aria-label="Export conversation"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClone}
          disabled={isCloning || !session.config}
          className="p-2 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          title="Clone agent"
          aria-label="Clone agent"
        >
          {isCloning ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Copy className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onSaveTemplate}
          disabled={!session.config}
          className="p-2 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          title="Save as template"
          aria-label="Save as template"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleLogs}
          aria-pressed={showLogs}
          className={clsx(
            'p-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
            showLogs ? 'bg-brand-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
          )}
          title="Toggle logs panel (Ctrl/Cmd+Shift+L)"
          aria-label="Toggle logs panel"
        >
          <FileText className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenConfig}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          aria-label="Open settings"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Settings</span>
        </button>
        {showStartStreamCta && (
          <button
            type="button"
            onClick={onStartAndStream}
            disabled={isStartStreamPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
          >
            {isStartStreamPending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{startStreamLabel}</span>
            <span className="sm:hidden">Start</span>
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            onClick={onPause}
            disabled={isPausing}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            aria-label="Pause agent"
          >
            <Pause className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Pause</span>
          </button>
        )}
        {(isRunning || isPaused) && (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            aria-label="Stop agent"
          >
            <Square className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
      </div>
    </div>
  );
}
