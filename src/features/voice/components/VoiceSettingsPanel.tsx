import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import type { AssistantFocus, ElevenLabsSttModel, ResponseDepth } from '../../../lib/voice/index';
import {
  SETTINGS_INPUT_CLASSES,
  SETTINGS_SELECT_CLASSES,
  VOICE_SETTINGS_PANEL_ID,
} from '../constants';

interface VoiceSettingsPanelProps {
  open: boolean;
  reduceMotion: boolean;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  voiceId: string;
  onVoiceIdChange: (value: string) => void;
  sttModel: ElevenLabsSttModel;
  onSttModelChange: (value: ElevenLabsSttModel) => void;
  ttsModel: string;
  onTtsModelChange: (value: string) => void;
  assistantFocus: AssistantFocus;
  onAssistantFocusChange: (value: AssistantFocus) => void;
  responseDepth: ResponseDepth;
  onResponseDepthChange: (value: ResponseDepth) => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
}

export function VoiceSettingsPanel({
  open,
  reduceMotion,
  apiKey,
  onApiKeyChange,
  voiceId,
  onVoiceIdChange,
  sttModel,
  onSttModelChange,
  ttsModel,
  onTtsModelChange,
  assistantFocus,
  onAssistantFocusChange,
  responseDepth,
  onResponseDepthChange,
  autoSpeak,
  onToggleAutoSpeak,
}: VoiceSettingsPanelProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="overflow-hidden border-b border-slate-700/50 shrink-0"
          id={VOICE_SETTINGS_PANEL_ID}
          role="region"
          aria-label="Voice settings"
        >
          <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  ElevenLabs API Key
                </span>
                <input
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  type="password"
                  placeholder="xi-..."
                  className={SETTINGS_INPUT_CLASSES}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  Voice ID
                </span>
                <input
                  value={voiceId}
                  onChange={(e) => onVoiceIdChange(e.target.value)}
                  className={SETTINGS_INPUT_CLASSES}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  STT Model
                </span>
                <select
                  value={sttModel}
                  onChange={(e) => onSttModelChange(e.target.value as ElevenLabsSttModel)}
                  className={SETTINGS_SELECT_CLASSES}
                >
                  <option value="scribe_v1">scribe_v1</option>
                  <option value="scribe_v2">scribe_v2</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  TTS Model
                </span>
                <input
                  value={ttsModel}
                  onChange={(e) => onTtsModelChange(e.target.value)}
                  className={SETTINGS_INPUT_CLASSES}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Focus</span>
                <select
                  value={assistantFocus}
                  onChange={(e) => onAssistantFocusChange(e.target.value as AssistantFocus)}
                  className={SETTINGS_SELECT_CLASSES}
                >
                  <option value="support">Customer Support</option>
                  <option value="operations">Operations</option>
                  <option value="growth">Growth</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Depth</span>
                <select
                  value={responseDepth}
                  onChange={(e) => onResponseDepthChange(e.target.value as ResponseDepth)}
                  className={SETTINGS_SELECT_CLASSES}
                >
                  <option value="concise">Concise</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onToggleAutoSpeak}
                role="switch"
                aria-checked={autoSpeak}
                aria-label="Auto-speak assistant replies"
                className={clsx(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  autoSpeak
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700/60 bg-slate-900/70 text-slate-400 hover:text-gray-200'
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full',
                    autoSpeak ? 'bg-emerald-400' : 'bg-slate-500'
                  )}
                />
                Auto-speak {autoSpeak ? 'on' : 'off'}
              </button>

              <p className="text-[11px] text-slate-500">API keys are kept in-memory only.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
