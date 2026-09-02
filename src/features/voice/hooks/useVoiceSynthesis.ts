import { useCallback, useRef, useState } from 'react';
import { synthesizeWithElevenLabs } from '../../../lib/voice/index';
import { BARGE_IN_COOLDOWN_MS } from '../constants';

export interface SpeakInput {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId: string;
}

export interface VoiceSynthesis {
  isSpeaking: boolean;
  /**
   * Synthesizes `text` with ElevenLabs and plays it. Resolves silently when
   * aborted; rethrows any other synthesis/playback error after cleanup.
   */
  speak: (input: SpeakInput) => Promise<void>;
  /** Aborts synthesis and stops any playing audio. */
  stopSpeaking: () => void;
  /** Stops playback and suppresses auto-speak for the barge-in cooldown. */
  triggerBargeIn: () => void;
  /** Whether auto-speak is currently suppressed by a recent barge-in. */
  isInBargeInCooldown: () => boolean;
  /** Whether the assistant message with this id has already been spoken. */
  hasSpokenMessage: (id: string) => boolean;
  /** Marks an assistant message as spoken so it is not replayed. */
  markMessageSpoken: (id: string) => void;
  /** Clears the spoken-message dedupe set (e.g. on session reset). */
  resetSpokenMessages: () => void;
}

/** Owns ElevenLabs text-to-speech playback, barge-in, and replay dedupe. */
export function useVoiceSynthesis(): VoiceSynthesis {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());
  const bargeInCooldownUntilRef = useRef<number>(0);

  const clearCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }

    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    setIsSpeaking(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    clearCurrentAudio();
  }, [clearCurrentAudio]);

  const triggerBargeIn = useCallback(() => {
    bargeInCooldownUntilRef.current = Date.now() + BARGE_IN_COOLDOWN_MS;
    stopSpeaking();
  }, [stopSpeaking]);

  const isInBargeInCooldown = useCallback(() => {
    return Date.now() < bargeInCooldownUntilRef.current;
  }, []);

  const hasSpokenMessage = useCallback((id: string) => spokenMessageIdsRef.current.has(id), []);

  const markMessageSpoken = useCallback((id: string) => {
    spokenMessageIdsRef.current.add(id);
  }, []);

  const resetSpokenMessages = useCallback(() => {
    spokenMessageIdsRef.current.clear();
  }, []);

  const speak = useCallback(
    async ({ apiKey, voiceId, text, modelId }: SpeakInput): Promise<void> => {
      stopSpeaking();
      const controller = new AbortController();
      ttsAbortControllerRef.current = controller;
      setIsSpeaking(true);

      try {
        const audioBlob = await synthesizeWithElevenLabs({
          apiKey,
          voiceId,
          text,
          modelId,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => clearCurrentAudio();
        audio.onerror = () => clearCurrentAudio();
        await audio.play();
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        clearCurrentAudio();
        throw error;
      }
    },
    [clearCurrentAudio, stopSpeaking]
  );

  return {
    isSpeaking,
    speak,
    stopSpeaking,
    triggerBargeIn,
    isInBargeInCooldown,
    hasSpokenMessage,
    markMessageSpoken,
    resetSpokenMessages,
  };
}
