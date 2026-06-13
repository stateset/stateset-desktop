/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceSettings } from './useVoiceSettings';
import {
  STORAGE_KEYS,
  DEFAULT_VOICE_ID,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_ASSISTANT_FOCUS,
  DEFAULT_RESPONSE_DEPTH,
} from '../../../lib/voice/index';

describe('useVoiceSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with defaults when nothing is stored', () => {
    const { result } = renderHook(() => useVoiceSettings());

    expect(result.current.apiKey).toBe('');
    expect(result.current.voiceId).toBe(DEFAULT_VOICE_ID);
    expect(result.current.sttModel).toBe(DEFAULT_STT_MODEL);
    expect(result.current.ttsModel).toBe(DEFAULT_TTS_MODEL);
    expect(result.current.assistantFocus).toBe(DEFAULT_ASSISTANT_FOCUS);
    expect(result.current.responseDepth).toBe(DEFAULT_RESPONSE_DEPTH);
    expect(result.current.autoSpeak).toBe(true);
  });

  it('restores persisted values on mount', () => {
    localStorage.setItem(STORAGE_KEYS.voiceId, 'custom-voice');
    localStorage.setItem(STORAGE_KEYS.sttModel, 'scribe_v2');
    localStorage.setItem(STORAGE_KEYS.ttsModel, 'eleven_multilingual_v2');
    localStorage.setItem(STORAGE_KEYS.assistantFocus, 'growth');
    localStorage.setItem(STORAGE_KEYS.responseDepth, 'detailed');
    localStorage.setItem(STORAGE_KEYS.autoSpeak, 'false');

    const { result } = renderHook(() => useVoiceSettings());

    expect(result.current.voiceId).toBe('custom-voice');
    expect(result.current.sttModel).toBe('scribe_v2');
    expect(result.current.ttsModel).toBe('eleven_multilingual_v2');
    expect(result.current.assistantFocus).toBe('growth');
    expect(result.current.responseDepth).toBe('detailed');
    expect(result.current.autoSpeak).toBe(false);
  });

  it('ignores invalid stored enum values', () => {
    localStorage.setItem(STORAGE_KEYS.sttModel, 'bogus-model');
    localStorage.setItem(STORAGE_KEYS.assistantFocus, 'bogus-focus');
    localStorage.setItem(STORAGE_KEYS.responseDepth, 'bogus-depth');

    const { result } = renderHook(() => useVoiceSettings());

    expect(result.current.sttModel).toBe(DEFAULT_STT_MODEL);
    expect(result.current.assistantFocus).toBe(DEFAULT_ASSISTANT_FOCUS);
    expect(result.current.responseDepth).toBe(DEFAULT_RESPONSE_DEPTH);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useVoiceSettings());

    act(() => {
      result.current.setVoiceId('new-voice');
    });
    act(() => {
      result.current.setAssistantFocus('operations');
    });

    expect(result.current.voiceId).toBe('new-voice');
    expect(localStorage.getItem(STORAGE_KEYS.voiceId)).toBe('new-voice');
    expect(localStorage.getItem(STORAGE_KEYS.assistantFocus)).toBe('operations');
  });

  it('toggles and persists autoSpeak', () => {
    const { result } = renderHook(() => useVoiceSettings());

    act(() => {
      result.current.toggleAutoSpeak();
    });

    expect(result.current.autoSpeak).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.autoSpeak)).toBe('false');
  });

  it('does not persist the API key', () => {
    const { result } = renderHook(() => useVoiceSettings());

    act(() => {
      result.current.setApiKey('xi-secret');
    });

    expect(result.current.apiKey).toBe('xi-secret');
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(localStorage.getItem(key)).not.toBe('xi-secret');
    }
  });
});
