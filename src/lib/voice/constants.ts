import type { ElevenLabsSttModel } from '../voice';

export const STORAGE_KEYS = {
  voiceId: 'voice.interface.voiceId',
  sttModel: 'voice.interface.sttModel',
  ttsModel: 'voice.interface.ttsModel',
  autoSpeak: 'voice.interface.autoSpeak',
  assistantFocus: 'voice.interface.assistantFocus',
  responseDepth: 'voice.interface.responseDepth',
} as const;

export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
export const DEFAULT_STT_MODEL: ElevenLabsSttModel = 'scribe_v1';
export const DEFAULT_TTS_MODEL = 'eleven_turbo_v2_5';

export type AssistantFocus = 'support' | 'operations' | 'growth';
export type ResponseDepth = 'concise' | 'balanced' | 'detailed';

export const DEFAULT_ASSISTANT_FOCUS: AssistantFocus = 'support';
export const DEFAULT_RESPONSE_DEPTH: ResponseDepth = 'balanced';
