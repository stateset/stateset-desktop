import { useCallback, useRef, useState } from 'react';
import { transcribeWithElevenLabs, type ElevenLabsSttModel } from '../../../lib/voice/index';

export interface TranscribeInput {
  apiKey: string;
  audioBlob: Blob;
  modelId: ElevenLabsSttModel;
}

export interface VoiceTranscription {
  isTranscribing: boolean;
  /**
   * Transcribes the recorded audio. Resolves to the transcript, or `null` if
   * the request was aborted. Rethrows any other transcription error.
   */
  transcribe: (input: TranscribeInput) => Promise<string | null>;
  /** Aborts the in-flight transcription request, if any. */
  abortTranscription: () => void;
}

/** Owns the ElevenLabs speech-to-text request lifecycle. */
export function useVoiceTranscription(): VoiceTranscription {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortTranscription = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const transcribe = useCallback(
    async ({ apiKey, audioBlob, modelId }: TranscribeInput): Promise<string | null> => {
      setIsTranscribing(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        return await transcribeWithElevenLabs({
          apiKey,
          audioBlob,
          modelId,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }
        throw error;
      } finally {
        setIsTranscribing(false);
        abortControllerRef.current = null;
      }
    },
    []
  );

  return { isTranscribing, transcribe, abortTranscription };
}
