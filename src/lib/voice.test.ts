import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { transcribeWithElevenLabs, synthesizeWithElevenLabs } from './voice';

interface MockJsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  blob?: () => Promise<Blob>;
}

let fetchMock: Mock<(input?: unknown, init?: RequestInit) => Promise<MockJsonResponse>>;

function jsonResponse(payload: unknown, status = 200): MockJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function invalidJsonResponse(status: number): MockJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('invalid json');
    },
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('transcribeWithElevenLabs', () => {
  const makeBlob = (type: string) => new Blob([new Uint8Array([1, 2, 3])], { type });

  it('posts audio as form data and returns the trimmed transcript', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: '  hello world  ' }));

    const result = await transcribeWithElevenLabs({
      apiKey: 'xi-key',
      audioBlob: makeBlob('audio/webm'),
    });

    expect(result).toBe('hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.elevenlabs.io/v1/speech-to-text'
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('xi-key');

    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model_id')).toBe('scribe_v1');
    const file = body.get('file') as File;
    expect(file.name).toBe('voice-input.webm');
    expect(file.type).toBe('audio/webm');
  });

  it('uses the requested model id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));

    await transcribeWithElevenLabs({
      apiKey: 'xi-key',
      audioBlob: makeBlob('audio/webm'),
      modelId: 'scribe_v2',
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('model_id')).toBe('scribe_v2');
  });

  it.each([
    ['audio/wav', 'voice-input.wav'],
    ['audio/x-wave', 'voice-input.wav'],
    ['audio/mpeg', 'voice-input.mp3'],
    ['audio/ogg', 'voice-input.webm'],
  ])('maps blob type %s to filename %s', async (type, expectedName) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));

    await transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob(type) });

    const file = (fetchMock.mock.calls[0]?.[1]?.body as FormData).get('file') as File;
    expect(file.name).toBe(expectedName);
  });

  it('defaults the file type to audio/webm when the blob has no type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));

    await transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob('') });

    const file = (fetchMock.mock.calls[0]?.[1]?.body as FormData).get('file') as File;
    expect(file.type).toBe('audio/webm');
  });

  it('falls back to the transcript field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transcript: ' from transcript ' }));

    const result = await transcribeWithElevenLabs({
      apiKey: 'xi-key',
      audioBlob: makeBlob('audio/webm'),
    });

    expect(result).toBe('from transcript');
  });

  it('throws when the response contains no usable text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: '   ' }));

    await expect(
      transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob('audio/webm') })
    ).rejects.toThrow('ElevenLabs transcription returned no text.');
  });

  it.each([
    [{ message: 'top-level message' }, 'top-level message'],
    [{ detail: 'top-level detail' }, 'top-level detail'],
    [{ error: 'top-level error' }, 'top-level error'],
    [{ error: { message: 'nested message' } }, 'nested message'],
    [{ error: { detail: 'nested detail' } }, 'nested detail'],
  ])('surfaces API error payload %j as "%s"', async (payload, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload, 422));

    await expect(
      transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob('audio/webm') })
    ).rejects.toThrow(expected);
  });

  it('falls back to an HTTP status message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(500));

    await expect(
      transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob('audio/webm') })
    ).rejects.toThrow('ElevenLabs transcription failed (HTTP 500)');
  });

  it('falls back to an HTTP status message when the error payload has no message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 401 } }, 401));

    await expect(
      transcribeWithElevenLabs({ apiKey: 'xi-key', audioBlob: makeBlob('audio/webm') })
    ).rejects.toThrow('ElevenLabs transcription failed (HTTP 401)');
  });

  it('forwards the abort signal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));
    const controller = new AbortController();

    await transcribeWithElevenLabs({
      apiKey: 'xi-key',
      audioBlob: makeBlob('audio/webm'),
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe('synthesizeWithElevenLabs', () => {
  it('posts text and returns the audio blob', async () => {
    const audio = new Blob([new Uint8Array([9, 9])], { type: 'audio/mpeg' });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => audio,
    });

    const result = await synthesizeWithElevenLabs({
      apiKey: 'xi-key',
      voiceId: 'voice-1',
      text: 'Hello there',
    });

    expect(result).toBe(audio);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-1/stream?output_format=mp3_44100_128'
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('xi-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'Hello there',
      model_id: 'eleven_turbo_v2_5',
    });
  });

  it('encodes the voice id and honors a custom model id', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => new Blob(),
    });

    await synthesizeWithElevenLabs({
      apiKey: 'xi-key',
      voiceId: 'voice/with space',
      text: 'Hi',
      modelId: 'eleven_multilingual_v2',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `/text-to-speech/${encodeURIComponent('voice/with space')}/stream`
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('surfaces API error messages on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Voice not found' }, 404));

    await expect(
      synthesizeWithElevenLabs({ apiKey: 'xi-key', voiceId: 'missing', text: 'Hi' })
    ).rejects.toThrow('Voice not found');
  });

  it('falls back to an HTTP status message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(502));

    await expect(
      synthesizeWithElevenLabs({ apiKey: 'xi-key', voiceId: 'voice-1', text: 'Hi' })
    ).rejects.toThrow('ElevenLabs speech synthesis failed (HTTP 502)');
  });

  it('forwards the abort signal to fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => new Blob(),
    });
    const controller = new AbortController();

    await synthesizeWithElevenLabs({
      apiKey: 'xi-key',
      voiceId: 'voice-1',
      text: 'Hi',
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
