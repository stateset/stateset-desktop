import { useEffect, useState } from 'react';
import {
  STORAGE_KEYS,
  DEFAULT_VOICE_ID,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_ASSISTANT_FOCUS,
  DEFAULT_RESPONSE_DEPTH,
  type AssistantFocus,
  type ResponseDepth,
  type ElevenLabsSttModel,
  readStoredValue,
  writeStoredValue,
  readStoredBoolean,
} from '../../../lib/voice/index';

export interface VoiceSettings {
  apiKey: string;
  setApiKey: (value: string) => void;
  voiceId: string;
  setVoiceId: (value: string) => void;
  sttModel: ElevenLabsSttModel;
  setSttModel: (value: ElevenLabsSttModel) => void;
  ttsModel: string;
  setTtsModel: (value: string) => void;
  assistantFocus: AssistantFocus;
  setAssistantFocus: (value: AssistantFocus) => void;
  responseDepth: ResponseDepth;
  setResponseDepth: (value: ResponseDepth) => void;
  autoSpeak: boolean;
  toggleAutoSpeak: () => void;
}

/**
 * Owns the voice profile settings. Everything except the ElevenLabs API key
 * (kept in-memory only) is persisted to localStorage and restored on mount.
 */
export function useVoiceSettings(): VoiceSettings {
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [sttModel, setSttModel] = useState<ElevenLabsSttModel>(DEFAULT_STT_MODEL);
  const [ttsModel, setTtsModel] = useState(DEFAULT_TTS_MODEL);
  const [assistantFocus, setAssistantFocus] = useState<AssistantFocus>(DEFAULT_ASSISTANT_FOCUS);
  const [responseDepth, setResponseDepth] = useState<ResponseDepth>(DEFAULT_RESPONSE_DEPTH);
  const [autoSpeak, setAutoSpeak] = useState(true);

  useEffect(() => {
    const storedVoiceId = readStoredValue(STORAGE_KEYS.voiceId);
    const storedSttModel = readStoredValue(STORAGE_KEYS.sttModel);
    const storedTtsModel = readStoredValue(STORAGE_KEYS.ttsModel);
    const storedAssistantFocus = readStoredValue(STORAGE_KEYS.assistantFocus);
    const storedResponseDepth = readStoredValue(STORAGE_KEYS.responseDepth);
    if (storedVoiceId) {
      setVoiceId(storedVoiceId);
    }
    if (storedSttModel === 'scribe_v1' || storedSttModel === 'scribe_v2') {
      setSttModel(storedSttModel);
    }
    if (storedTtsModel) {
      setTtsModel(storedTtsModel);
    }
    if (
      storedAssistantFocus === 'support' ||
      storedAssistantFocus === 'operations' ||
      storedAssistantFocus === 'growth'
    ) {
      setAssistantFocus(storedAssistantFocus);
    }
    if (
      storedResponseDepth === 'concise' ||
      storedResponseDepth === 'balanced' ||
      storedResponseDepth === 'detailed'
    ) {
      setResponseDepth(storedResponseDepth);
    }
    setAutoSpeak(readStoredBoolean(STORAGE_KEYS.autoSpeak, true));
  }, []);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.voiceId, voiceId);
  }, [voiceId]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.sttModel, sttModel);
  }, [sttModel]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.ttsModel, ttsModel);
  }, [ttsModel]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.autoSpeak, String(autoSpeak));
  }, [autoSpeak]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.assistantFocus, assistantFocus);
  }, [assistantFocus]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.responseDepth, responseDepth);
  }, [responseDepth]);

  return {
    apiKey,
    setApiKey,
    voiceId,
    setVoiceId,
    sttModel,
    setSttModel,
    ttsModel,
    setTtsModel,
    assistantFocus,
    setAssistantFocus,
    responseDepth,
    setResponseDepth,
    autoSpeak,
    toggleAutoSpeak: () => setAutoSpeak((v) => !v),
  };
}
