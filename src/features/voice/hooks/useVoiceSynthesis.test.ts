/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoiceSynthesis } from './useVoiceSynthesis';
import { synthesizeWithElevenLabs } from '../../../lib/voice/index';

vi.mock('../../../lib/voice/index', () => ({
  synthesizeWithElevenLabs: vi.fn(),
}));

const mockSynthesize = vi.mocked(synthesizeWithElevenLabs);

class MockAudio {
  static instances: MockAudio[] = [];

  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }
}

const speakInput = {
  apiKey: 'xi-key',
  voiceId: 'voice-1',
  text: 'Hello there',
  modelId: 'eleven_turbo_v2_5',
};

describe('useVoiceSynthesis', () => {
  beforeEach(() => {
    MockAudio.instances = [];
    mockSynthesize.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
    vi.stubGlobal('Audio', MockAudio);
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('synthesizes and plays audio, tracking the speaking state', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    await act(async () => {
      await result.current.speak(speakInput);
    });

    expect(mockSynthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'xi-key',
        voiceId: 'voice-1',
        text: 'Hello there',
        modelId: 'eleven_turbo_v2_5',
      })
    );
    expect(result.current.isSpeaking).toBe(true);
    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0].play).toHaveBeenCalledOnce();
  });

  it('clears the speaking state when playback ends', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    await act(async () => {
      await result.current.speak(speakInput);
    });
    act(() => {
      MockAudio.instances[0].onended?.();
    });

    await waitFor(() => expect(result.current.isSpeaking).toBe(false));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('stopSpeaking pauses the audio and revokes the object URL', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    await act(async () => {
      await result.current.speak(speakInput);
    });
    act(() => {
      result.current.stopSpeaking();
    });

    expect(MockAudio.instances[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(result.current.isSpeaking).toBe(false);
  });

  it('resolves silently when synthesis is aborted mid-flight', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    let rejectSynthesis: (error: Error) => void = () => {};
    mockSynthesize.mockImplementation(
      (input: { signal?: AbortSignal }) =>
        new Promise<Blob>((_, reject) => {
          rejectSynthesis = reject;
          input.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    let speakPromise: Promise<void> = Promise.resolve();
    act(() => {
      speakPromise = result.current.speak(speakInput);
    });
    act(() => {
      result.current.stopSpeaking();
      rejectSynthesis(new Error('aborted'));
    });

    await expect(speakPromise).resolves.toBeUndefined();
    expect(MockAudio.instances).toHaveLength(0);
  });

  it('rethrows synthesis errors and clears the speaking state', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());
    mockSynthesize.mockRejectedValue(new Error('synthesis failed'));

    let speakPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      speakPromise = result.current.speak(speakInput);
      await speakPromise.catch(() => {});
    });

    await expect(speakPromise).rejects.toThrow('synthesis failed');
    expect(result.current.isSpeaking).toBe(false);
  });

  it('triggerBargeIn starts the cooldown window and stops playback', async () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    await act(async () => {
      await result.current.speak(speakInput);
    });

    expect(result.current.isInBargeInCooldown()).toBe(false);
    act(() => {
      result.current.triggerBargeIn();
    });

    expect(result.current.isInBargeInCooldown()).toBe(true);
    expect(result.current.isSpeaking).toBe(false);
    expect(MockAudio.instances[0].pause).toHaveBeenCalled();
  });

  it('tracks and resets spoken message ids', () => {
    const { result } = renderHook(() => useVoiceSynthesis());

    expect(result.current.hasSpokenMessage('m1')).toBe(false);
    act(() => {
      result.current.markMessageSpoken('m1');
    });
    expect(result.current.hasSpokenMessage('m1')).toBe(true);

    act(() => {
      result.current.resetSpokenMessages();
    });
    expect(result.current.hasSpokenMessage('m1')).toBe(false);
  });
});
