import { Loader2, Mic, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface VoiceOrbProps {
  isRecording: boolean;
  isConnected: boolean;
  isTranscribing: boolean;
  reduceMotion: boolean;
}

/** Decorative animated orb shown while the conversation is empty. */
export function VoiceOrb({
  isRecording,
  isConnected,
  isTranscribing,
  reduceMotion,
}: VoiceOrbProps) {
  return (
    <div className="relative w-48 h-48" aria-hidden="true">
      {/* Outer glow ring — ping */}
      <div
        className={clsx(
          'absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 transition-all duration-1000',
          isRecording
            ? 'scale-[1.4] opacity-[0.35]'
            : isConnected
              ? 'scale-[1.15] opacity-[0.18]'
              : 'scale-110 opacity-[0.12]'
        )}
        style={reduceMotion ? undefined : { animation: 'ping 6s cubic-bezier(0,0,0.2,1) infinite' }}
      />

      {/* Middle glow ring — pulse */}
      <div
        className={clsx(
          'absolute inset-0 rounded-full bg-gradient-to-r from-purple-300 to-cyan-300 transition-all duration-700',
          isRecording
            ? 'scale-125 opacity-[0.4]'
            : isConnected
              ? 'scale-110 opacity-[0.22]'
              : 'scale-105 opacity-[0.16]'
        )}
        style={
          reduceMotion ? undefined : { animation: 'pulse 5s cubic-bezier(0.4,0,0.6,1) infinite' }
        }
      />

      {/* Main globe */}
      <div
        className={clsx(
          'relative w-48 h-48 rounded-full bg-gradient-to-br from-purple-500 via-purple-400 to-cyan-400 shadow-2xl overflow-hidden transition-all duration-1000',
          isRecording
            ? 'shadow-purple-500/50'
            : isConnected
              ? 'shadow-emerald-500/25'
              : 'shadow-slate-500/20'
        )}
        style={
          reduceMotion ? undefined : { animation: 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite' }
        }
      >
        {/* Animated gradient overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-transparent via-white/25 to-transparent"
          style={
            reduceMotion ? undefined : { animation: 'pulse 6s cubic-bezier(0.4,0,0.6,1) infinite' }
          }
        />

        {/* Depth gradient */}
        <div
          className="absolute inset-0 bg-gradient-to-tr from-purple-600/40 via-transparent to-cyan-300/40"
          style={
            reduceMotion
              ? undefined
              : {
                  animation: 'pulse 7s cubic-bezier(0.4,0,0.6,1) infinite',
                  animationDelay: '1s',
                }
          }
        />

        {/* Inner rotating ring */}
        <div
          className={clsx(
            'absolute inset-6 border-2 rounded-full',
            isRecording
              ? 'border-yellow-300/50'
              : isConnected
                ? 'border-white/35'
                : 'border-white/15'
          )}
          style={
            reduceMotion
              ? undefined
              : { animation: `spin ${isRecording ? '8s' : '30s'} linear infinite` }
          }
        />

        {/* Voice recording indicator */}
        {isRecording && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-20 h-20 border-[3px] border-yellow-300 rounded-full border-t-transparent"
              style={reduceMotion ? undefined : { animation: 'spin 3s linear infinite' }}
            />
          </div>
        )}

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isTranscribing ? (
            <Loader2 className="w-10 h-10 text-white animate-spin" aria-hidden="true" />
          ) : isRecording ? (
            <Mic className="w-10 h-10 text-white drop-shadow-lg" aria-hidden="true" />
          ) : (
            <Sparkles className="w-10 h-10 text-white/80 drop-shadow-lg" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Connection status dot */}
      <div
        className={clsx(
          'absolute top-2 right-2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-colors duration-500',
          isRecording ? 'bg-yellow-400' : isConnected ? 'bg-emerald-400' : 'bg-slate-400'
        )}
        style={
          isRecording && !reduceMotion
            ? { animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }
            : undefined
        }
      />
    </div>
  );
}
