import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic, Send } from 'lucide-react';
import clsx from 'clsx';

interface VoiceInputBarProps {
  manualInput: string;
  onManualInputChange: (value: string) => void;
  onManualSend: () => void;
  canRecord: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  isSending: boolean;
  reduceMotion: boolean;
  onRecordStart: () => void;
  onRecordStop: () => void;
}

export function VoiceInputBar({
  manualInput,
  onManualInputChange,
  onManualSend,
  canRecord,
  isRecording,
  isTranscribing,
  isSpeaking,
  isSending,
  reduceMotion,
  onRecordStart,
  onRecordStop,
}: VoiceInputBarProps) {
  const handleRecordStart = () => {
    if (!isRecording && canRecord) {
      onRecordStart();
    }
  };

  const handleRecordStop = () => {
    if (isRecording) {
      onRecordStop();
    }
  };

  return (
    <div className="border-t border-slate-700/50 bg-slate-950/80 backdrop-blur-sm px-4 py-3 shrink-0">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <input
          value={manualInput}
          onChange={(e) => onManualInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onManualSend();
            }
          }}
          placeholder="Type a message…"
          aria-label="Message the voice agent"
          className="flex-1 rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2.5 text-sm text-gray-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35"
        />

        {/* Mic button with orb-style glow */}
        <div className="relative">
          {/* Outer glow — matches the orb palette */}
          {!reduceMotion && (
            <span
              aria-hidden="true"
              className={clsx(
                'absolute -inset-2 rounded-full transition-opacity duration-500',
                isRecording
                  ? 'bg-gradient-to-r from-purple-400/40 to-cyan-400/40 opacity-100'
                  : 'bg-gradient-to-r from-purple-400/15 to-cyan-400/15 opacity-0 group-hover:opacity-100'
              )}
              style={
                isRecording ? { animation: 'ping 3s cubic-bezier(0,0,0.2,1) infinite' } : undefined
              }
            />
          )}
          {isRecording && !reduceMotion && (
            <motion.span
              aria-hidden="true"
              className="absolute -inset-1 rounded-full border-2 border-purple-400/60"
              animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.25, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleRecordStart();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              handleRecordStop();
            }}
            onPointerCancel={handleRecordStop}
            onPointerLeave={handleRecordStop}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                handleRecordStart();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleRecordStop();
              }
            }}
            disabled={!canRecord}
            className={clsx(
              'relative w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed',
              isRecording
                ? 'bg-gradient-to-br from-purple-500 to-cyan-400 text-white shadow-lg shadow-purple-500/30'
                : 'border-2 border-slate-600 bg-slate-800 text-slate-300 hover:border-purple-400/50 hover:text-white hover:shadow-lg hover:shadow-purple-500/20'
            )}
            aria-label={isRecording ? 'Release to send' : 'Hold to talk'}
          >
            {isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <Mic className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={onManualSend}
          disabled={!manualInput.trim() || isSending}
          className="rounded-xl border border-brand-500/40 bg-brand-500/20 px-3.5 py-2.5 text-sm font-medium text-sky-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-500/30"
          aria-label="Send message"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Status text below input when active */}
      <AnimatePresence>
        {(isRecording || isTranscribing || isSpeaking) && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            aria-live="polite"
            className="text-center text-xs text-slate-400 mt-2"
          >
            {isRecording
              ? 'Listening… release to send'
              : isTranscribing
                ? 'Transcribing…'
                : 'Speaking…'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
