/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { RECORDER_TIMESLICE_MS } from '../constants';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn((_timeslice?: number) => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });

  constructor(public stream: unknown) {
    MockMediaRecorder.instances.push(this);
  }
}

function makeMockStream() {
  const track = { stop: vi.fn() };
  return {
    stream: { getTracks: () => [track] },
    track,
  };
}

describe('useVoiceRecorder', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let track: { stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    const mock = makeMockStream();
    track = mock.track;
    getUserMedia = vi.fn().mockResolvedValue(mock.stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports capture support when MediaRecorder and getUserMedia exist', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isCaptureSupported()).toBe(true);
  });

  it('reports no capture support without MediaRecorder', () => {
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isCaptureSupported()).toBe(false);
  });

  it('starts recording with echo cancellation constraints and timeslice', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const onStop = vi.fn();

    await act(async () => {
      await result.current.startCapture(onStop);
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(result.current.isRecording).toBe(true);
    const recorder = MockMediaRecorder.instances[0];
    expect(recorder.start).toHaveBeenCalledWith(RECORDER_TIMESLICE_MS);
  });

  it('invokes onStop when capture is stopped', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const onStop = vi.fn();

    await act(async () => {
      await result.current.startCapture(onStop);
    });
    act(() => {
      result.current.stopCapture();
    });

    expect(onStop).toHaveBeenCalledOnce();
  });

  it('propagates getUserMedia failures', async () => {
    getUserMedia.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useVoiceRecorder());

    await expect(result.current.startCapture(vi.fn())).rejects.toThrow('denied');
    expect(result.current.isRecording).toBe(false);
  });

  it('finishCapture builds a webm blob from recorded chunks and releases the stream', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startCapture(vi.fn());
    });

    const recorder = MockMediaRecorder.instances[0];
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['chunk-a']) });
      recorder.ondataavailable?.({ data: new Blob(['chunk-b']) });
    });

    let blob: Blob | undefined;
    act(() => {
      blob = result.current.finishCapture();
    });

    expect(blob?.type).toBe('audio/webm');
    expect(blob?.size).toBeGreaterThan(0);
    expect(result.current.isRecording).toBe(false);
    expect(track.stop).toHaveBeenCalled();
  });

  it('finishCapture returns an empty octet-stream blob when nothing was captured', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startCapture(vi.fn());
    });

    let blob: Blob | undefined;
    act(() => {
      blob = result.current.finishCapture();
    });

    expect(blob?.type).toBe('application/octet-stream');
    expect(blob?.size).toBe(0);
  });

  it('releaseCapture(true) suppresses the onStop callback', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const onStop = vi.fn();

    await act(async () => {
      await result.current.startCapture(onStop);
    });
    act(() => {
      result.current.releaseCapture(true);
    });

    expect(onStop).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('ignores zero-size data chunks', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startCapture(vi.fn());
    });

    const recorder = MockMediaRecorder.instances[0];
    act(() => {
      recorder.ondataavailable?.({ data: { size: 0 } });
    });

    let blob: Blob | undefined;
    act(() => {
      blob = result.current.finishCapture();
    });

    expect(blob?.size).toBe(0);
  });
});
