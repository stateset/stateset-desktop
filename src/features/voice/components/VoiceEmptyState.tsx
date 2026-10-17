import { Settings2 } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';

interface VoiceEmptyStateProps {
  isRecording: boolean;
  isConnected: boolean;
  isTranscribing: boolean;
  isSending: boolean;
  reduceMotion: boolean;
  hasApiKey: boolean;
  quickActionPrompts: readonly string[];
  onOpenSettings: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export function VoiceEmptyState({
  isRecording,
  isConnected,
  isTranscribing,
  isSending,
  reduceMotion,
  hasApiKey,
  quickActionPrompts,
  onOpenSettings,
  onSelectPrompt,
}: VoiceEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
      <VoiceOrb
        isRecording={isRecording}
        isConnected={isConnected}
        isTranscribing={isTranscribing}
        reduceMotion={reduceMotion}
      />

      {!hasApiKey ? (
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-amber-300">ElevenLabs API key required</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Add your API key in settings to enable voice recording and speech synthesis.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            Open Settings
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">How can I help you today?</p>
      )}

      {/* Quick action chips */}
      <div className="flex flex-wrap justify-center gap-2 max-w-xl">
        {quickActionPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            disabled={isSending}
            className="rounded-full border border-slate-700/60 bg-slate-900/55 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800/80 hover:text-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
