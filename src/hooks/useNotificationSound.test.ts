/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationSound } from './useNotificationSound';

// --- Mocks ---

const prefsState = { soundAlerts: true };

vi.mock('../stores/preferences', () => ({
  usePreferencesStore: (selector: (s: typeof prefsState) => unknown) => selector(prefsState),
}));

function createMockOscillator() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
}

function createMockGain() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
}

let oscillators: ReturnType<typeof createMockOscillator>[];
let gains: ReturnType<typeof createMockGain>[];
let audioContextConstructor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  prefsState.soundAlerts = true;
  oscillators = [];
  gains = [];

  const oscillatorList = oscillators;
  const gainList = gains;
  audioContextConstructor = vi.fn(function MockAudioContext() {
    return {
      currentTime: 0,
      destination: { name: 'destination' },
      createOscillator: vi.fn(() => {
        const osc = createMockOscillator();
        oscillatorList.push(osc);
        return osc;
      }),
      createGain: vi.fn(() => {
        const gain = createMockGain();
        gainList.push(gain);
        return gain;
      }),
    };
  });

  vi.stubGlobal('AudioContext', audioContextConstructor);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useNotificationSound', () => {
  it.each(['playMessage', 'playSuccess', 'playError', 'playAlert'] as const)(
    '%s synthesizes and plays a sound',
    (method) => {
      const { result } = renderHook(() => useNotificationSound());

      act(() => {
        result.current[method]();
      });

      expect(oscillators).toHaveLength(1);
      const osc = oscillators[0];
      expect(osc.connect).toHaveBeenCalledWith(gains[0]);
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
      expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
      expect(gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    }
  );

  it('connects the gain node to the audio context destination', () => {
    const { result } = renderHook(() => useNotificationSound());

    act(() => {
      result.current.playMessage();
    });

    const context = audioContextConstructor.mock.results[0]?.value as {
      destination: unknown;
    };
    expect(gains[0].connect).toHaveBeenCalledWith(context.destination);
  });

  it('does nothing when sound alerts are disabled', () => {
    prefsState.soundAlerts = false;
    const { result } = renderHook(() => useNotificationSound());

    act(() => {
      result.current.playMessage();
      result.current.playError();
    });

    expect(audioContextConstructor).not.toHaveBeenCalled();
    expect(oscillators).toHaveLength(0);
  });

  it('reuses a single AudioContext across multiple plays', () => {
    const { result } = renderHook(() => useNotificationSound());

    act(() => {
      result.current.playMessage();
      result.current.playSuccess();
      result.current.playAlert();
    });

    expect(audioContextConstructor).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(3);
  });

  it('stops each sound after its scheduled duration', () => {
    const { result } = renderHook(() => useNotificationSound());

    act(() => {
      result.current.playError();
    });

    // Error sound: start at currentTime (0), stop at currentTime + 0.25
    expect(oscillators[0].start).toHaveBeenCalledWith(0);
    expect(oscillators[0].stop).toHaveBeenCalledWith(0.25);
  });

  it('swallows Audio API errors instead of throwing', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function FailingAudioContext(): never {
        throw new Error('Audio not available');
      })
    );
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { result } = renderHook(() => useNotificationSound());

    expect(() => {
      act(() => {
        result.current.playMessage();
      });
    }).not.toThrow();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });
});
