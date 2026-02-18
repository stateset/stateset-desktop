import { useCallback, useRef } from 'react';
import { usePreferencesStore } from '../stores/preferences';

type SoundType = 'message' | 'error' | 'success' | 'alert';

// Simple notification sounds using the Web Audio API
// These are short synthesized sounds that don't require external files
export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundAlerts = usePreferencesStore((state) => state.soundAlerts);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!soundAlerts) return;

      try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Different sounds for different events
        switch (type) {
          case 'message':
            // Pleasant ping sound
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
            break;

          case 'success':
            // Rising tone - success
            oscillator.frequency.setValueAtTime(440, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.2);
            break;

          case 'error':
            // Low descending tone - error
            oscillator.frequency.setValueAtTime(330, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(165, ctx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.25);
            break;

          case 'alert':
            // Two-tone alert
            oscillator.frequency.setValueAtTime(600, ctx.currentTime);
            oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
            break;
        }
      } catch (error) {
        // Audio API might not be available in all environments
        console.debug('Could not play notification sound:', error);
      }
    },
    [soundAlerts, getAudioContext]
  );

  return {
    playMessage: useCallback(() => playSound('message'), [playSound]),
    playSuccess: useCallback(() => playSound('success'), [playSound]),
    playError: useCallback(() => playSound('error'), [playSound]),
    playAlert: useCallback(() => playSound('alert'), [playSound]),
  };
}
