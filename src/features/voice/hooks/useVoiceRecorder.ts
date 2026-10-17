import { useCallback, useRef, useState } from 'react';
import { RECORDER_TIMESLICE_MS } from '../constants';

export interface VoiceRecorder {
  isRecording: boolean;
  /** Whether the current environment supports MediaRecorder audio capture. */
  isCaptureSupported: () => boolean;
  /**
   * Requests microphone access and starts recording. `onStop` is invoked when
   * the recorder stops (typically wired to transcription). Throws if the
   * microphone cannot be accessed.
   */
  startCapture: (onStop: () => void) => Promise<void>;
  /** Stops the active recorder, which triggers its `onStop` callback. */
  stopCapture: () => void;
  /**
   * Marks recording as finished, releases the media stream, and returns the
   * recorded audio as a single blob (empty if nothing was captured).
   */
  finishCapture: () => Blob;
  /** Releases the recorder and stream without producing audio. */
  releaseCapture: (suppressOnStop?: boolean) => void;
}

/** Owns MediaRecorder lifecycle and the captured audio chunks. */
export function useVoiceRecorder(): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const isCaptureSupported = useCallback(() => {
    return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  }, []);

  const releaseCapture = useCallback((suppressOnStop: boolean = false) => {
    if (mediaRecorderRef.current && suppressOnStop) {
      mediaRecorderRef.current.onstop = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startCapture = useCallback(async (onStop: () => void) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;
    recordedChunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = onStop;

    recorder.start(RECORDER_TIMESLICE_MS);
    setIsRecording(true);
  }, []);

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const finishCapture = useCallback((): Blob => {
    setIsRecording(false);
    releaseCapture();
    const audioBlob = new Blob(recordedChunksRef.current, {
      type: recordedChunksRef.current.length ? 'audio/webm' : 'application/octet-stream',
    });
    recordedChunksRef.current = [];
    return audioBlob;
  }, [releaseCapture]);

  return {
    isRecording,
    isCaptureSupported,
    startCapture,
    stopCapture,
    finishCapture,
    releaseCapture,
  };
}
