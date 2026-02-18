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
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div
              className={clsx(
                'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900',
                isRunning && 'bg-green-500 animate-pulse',
                isPaused && 'bg-amber-500',
                !isRunning && !isPaused && 'bg-gray-500'
              )}
            />
          </div>
          <div>
            <h1 className="font-semibold">
              {session.name?.trim()
                ? session.name
                : `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} Agent`}
            </h1>
            <p className="text-sm text-gray-400">
              {session.name?.trim()
                ? `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} \u2022 `
                : ''}
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSearch}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            showSearch ? 'bg-brand-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
          )}
          title="Search in conversation (Ctrl/Cmd+F)"
          aria-label="Search in conversation"
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          onClick={onExport}
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          title="Export conversation (Ctrl/Cmd+E)"
          aria-label="Export conversation"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onClone}
          disabled={isCloning || !session.config}
          className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
          title="Clone agent"
          aria-label="Clone agent"
        >
          {isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={onSaveTemplate}
          disabled={!session.config}
          className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
          title="Save as template"
          aria-label="Save as template"
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleLogs}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            showLogs ? 'bg-brand-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
          )}
          title="Toggle logs panel (Ctrl/Cmd+Shift+L)"
          aria-label="Toggle logs panel"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenConfig}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        {showStartStreamCta && (
          <button
            onClick={onStartAndStream}
            disabled={isStartStreamPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
          >
            {isStartStreamPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {startStreamLabel}
          </button>
        )}
        {isRunning && (
          <button
            onClick={onPause}
            disabled={isPausing}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
        )}
        {(isRunning || isPaused) && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
