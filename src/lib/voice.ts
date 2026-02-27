const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readErrorMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const direct =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.detail === 'string' && payload.detail) ||
    (typeof payload.error === 'string' && payload.error);
  if (direct) {
    return direct;
  }

  if (isRecord(payload.error)) {
    const nested =
      (typeof payload.error.message === 'string' && payload.error.message) ||
      (typeof payload.error.detail === 'string' && payload.error.detail);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const readTranscript = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  if (typeof payload.transcript === 'string' && payload.transcript.trim()) {
    return payload.transcript.trim();
  }

  return null;
};

type ElevenLabsRequestBase = {
  apiKey: string;
  signal?: AbortSignal;
};

export type ElevenLabsSttModel = 'scribe_v1' | 'scribe_v2';

type TranscribeAudioInput = ElevenLabsRequestBase & {
  audioBlob: Blob;
  modelId?: ElevenLabsSttModel;
};

export async function transcribeWithElevenLabs({
  apiKey,
  audioBlob,
  signal,
  modelId = 'scribe_v1',
}: TranscribeAudioInput): Promise<string> {
  const formData = new FormData();
  const extension =
    audioBlob.type.includes('wav') || audioBlob.type.includes('wave')
      ? 'wav'
      : audioBlob.type.includes('mpeg')
        ? 'mp3'
        : 'webm';

  formData.append(
    'file',
    new File([audioBlob], `voice-input.${extension}`, {
      type: audioBlob.type || 'audio/webm',
    })
  );
  formData.append('model_id', modelId);

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
    signal,
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message = readErrorMessage(payload);
    throw new Error(message || `ElevenLabs transcription failed (HTTP ${response.status})`);
  }

  const transcript = readTranscript(payload);
  if (!transcript) {
    throw new Error('ElevenLabs transcription returned no text.');
  }

  return transcript;
}

type SynthesizeSpeechInput = ElevenLabsRequestBase & {
  voiceId: string;
  text: string;
  modelId?: string;
};

export async function synthesizeWithElevenLabs({
  apiKey,
  voiceId,
  text,
  signal,
  modelId = 'eleven_turbo_v2_5',
}: SynthesizeSpeechInput): Promise<Blob> {
  const response = await fetch(
    `${ELEVENLABS_API_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
      signal,
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const message = readErrorMessage(payload);
    throw new Error(message || `ElevenLabs speech synthesis failed (HTTP ${response.status})`);
  }

  return response.blob();
}
