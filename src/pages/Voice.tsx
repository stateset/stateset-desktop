import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../stores/auth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ToastProvider';
import { agentApi } from '../lib/api';
import { useAgentStream } from '../hooks/useAgentStream';
import { getErrorMessage } from '../lib/errors';
import { requireBrandId, requireTenantId } from '../lib/auth-guards';
import {
  synthesizeWithElevenLabs,
  transcribeWithElevenLabs,
  type ElevenLabsSttModel,
  STORAGE_KEYS,
  DEFAULT_VOICE_ID,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_ASSISTANT_FOCUS,
  DEFAULT_RESPONSE_DEPTH,
  type AssistantFocus,
  type ResponseDepth,
  buildVoiceAgentPrompt,
  formatEventTime,
  readStoredValue,
  writeStoredValue,
  readStoredBoolean,
} from '../lib/voice/index';

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};

function isMessageEvent(
  value: ReturnType<typeof useAgentStream>['messages'][number]
): value is ReturnType<typeof useAgentStream>['messages'][number] & {
  type: 'message';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
} {
  return value.type === 'message';
}

export default function Voice() {
  usePageTitle('Voice');
  const reduceMotion = useReducedMotion();
  const tenant = useAuthStore((state) => state.tenant);
  const currentBrand = useAuthStore((state) => state.currentBrand);
  const { showToast } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isProvisioningSession, setIsProvisioningSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [sttModel, setSttModel] = useState<ElevenLabsSttModel>(DEFAULT_STT_MODEL);
  const [ttsModel, setTtsModel] = useState(DEFAULT_TTS_MODEL);
  const [assistantFocus, setAssistantFocus] = useState<AssistantFocus>(DEFAULT_ASSISTANT_FOCUS);
  const [responseDepth, setResponseDepth] = useState<ResponseDepth>(DEFAULT_RESPONSE_DEPTH);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [, setLastTranscript] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const sttAbortControllerRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const spokenAssistantIdsRef = useRef<Set<string>>(new Set());
  const bargeInCooldownUntilRef = useRef<number>(0);
  const conversationEndRef = useRef<HTMLDivElement>(null);

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
    bargeInCooldownUntilRef.current = Date.now() + 1500;
    stopSpeaking();
  }, [stopSpeaking]);

  const {
    isConnected,
    isConnecting,
    error: _streamError,
    messages,
    status: _streamStatus,
    metrics: _streamMetrics,
    connect,
    disconnect,
    clearEvents,
  } = useAgentStream({
    tenantId: tenant?.id ?? '',
    brandId: currentBrand?.id ?? '',
    sessionId: sessionId ?? '',
    autoReconnect: true,
    onEvent: (event) => {
      if (event.type !== 'message' || event.role !== 'assistant') {
        return;
      }

      if (Date.now() < bargeInCooldownUntilRef.current) {
        return;
      }

      if (isRecording || isTranscribing || isSending) {
        return;
      }

      if (!autoSpeak || !apiKey.trim() || !voiceId.trim()) {
        return;
      }

      if (spokenAssistantIdsRef.current.has(event.id)) {
        return;
      }
      spokenAssistantIdsRef.current.add(event.id);

      const playAssistantAudio = async () => {
        stopSpeaking();
        const controller = new AbortController();
        ttsAbortControllerRef.current = controller;
        setIsSpeaking(true);

        try {
          const audioBlob = await synthesizeWithElevenLabs({
            apiKey: apiKey.trim(),
            voiceId: voiceId.trim(),
            text: event.content,
            modelId: ttsModel,
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
          showToast({
            variant: 'error',
            title: 'Voice playback failed',
            message: getErrorMessage(error),
          });
        }
      };

      void playAssistantAudio();
    },
    onError: (message) => {
      showToast({
        variant: 'error',
        title: 'Stream connection issue',
        message,
      });
    },
  });

  const conversation = useMemo<ConversationMessage[]>(() => {
    const seen = new Set<string>();
    const mapped: ConversationMessage[] = [];
    for (const event of messages) {
      if (!isMessageEvent(event)) continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      mapped.push({
        id: event.id,
        role: event.role,
        content: event.content,
        timestamp: event._timestamp,
      });
    }
    return mapped.slice(-40);
  }, [messages]);

  const canRecord = Boolean(apiKey.trim()) && !isProvisioningSession && !isSending && !isTranscribing;

  const streamStatusLabel = useMemo(() => {
    if (isTranscribing) return 'Transcribing voice';
    if (isRecording) return 'Listening';
    if (isSpeaking) return 'Speaking';
    if (isConnecting || isProvisioningSession) return 'Connecting';
    if (isConnected) return 'Live';
    if (sessionId) return 'Ready';
    return 'Offline';
  }, [isConnected, isConnecting, isProvisioningSession, isRecording, isSpeaking, isTranscribing, sessionId]);

  const quickActionPrompts = useMemo(() => {
    if (assistantFocus === 'operations') {
      return [
        'Summarize current operational risks and suggest the top 3 mitigations.',
        'Draft a runbook for handling failed order modifications in under 5 minutes.',
        'Identify automations that would reduce repetitive support workload this week.',
      ];
    }

    if (assistantFocus === 'growth') {
      return [
        'Give me 3 high-impact conversion ideas based on common support conversations.',
        'Draft a concise campaign message for win-back customers.',
        'Recommend retention plays for customers with delayed shipments.',
      ];
    }

    return [
      'Help me respond to: "Where is my order #1001?"',
      'Draft a kind response for a delayed delivery complaint.',
      'Give a 3-step plan for handling return and exchange requests faster.',
    ];
  }, [assistantFocus]);

  const resetSession = useCallback(() => {
    disconnect();
    setSessionId(null);
    setLastTranscript(null);
    spokenAssistantIdsRef.current.clear();
    clearEvents();
    stopSpeaking();
    showToast({
      variant: 'success',
      title: 'Voice session reset',
      message: 'A new session will be created with your current voice profile.',
    });
  }, [clearEvents, disconnect, showToast, stopSpeaking]);

  const stopAndReleaseRecordingStream = useCallback((suppressOnStop: boolean = false) => {
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

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) {
      return sessionId;
    }

    if (!tenant || !currentBrand) {
      throw new Error('Select an active tenant and brand before starting voice mode.');
    }

    setIsProvisioningSession(true);
    try {
      const tenantId = requireTenantId(tenant);
      const brandId = requireBrandId(currentBrand);

      const session = await agentApi.createSession(tenantId, brandId, 'interactive', {
        loop_interval_ms: 1000,
        max_iterations: 0,
        iteration_timeout_secs: 300,
        pause_on_error: false,
        custom_instructions: buildVoiceAgentPrompt(assistantFocus, responseDepth),
        model: 'claude-sonnet-4-6',
        temperature: 0.5,
        mcp_servers: [],
      });

      await agentApi.startSession(tenantId, brandId, session.id);
      spokenAssistantIdsRef.current.clear();
      setSessionId(session.id);
      showToast({
        variant: 'success',
        title: 'Voice session ready',
        message: 'Session created. Stream will connect automatically.',
      });
      return session.id;
    } finally {
      setIsProvisioningSession(false);
    }
  }, [assistantFocus, currentBrand, responseDepth, sessionId, showToast, tenant]);

  const sendTranscriptToAgent = useCallback(
    async (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        return;
      }

      triggerBargeIn();
      setIsSending(true);
      setLastTranscript(trimmed);

      try {
        const tenantId = requireTenantId(tenant);
        const brandId = requireBrandId(currentBrand);
        const resolvedSessionId = await ensureSession();
        if (sessionId && !isConnected) {
          connect();
        }
        await agentApi.sendMessage(tenantId, brandId, resolvedSessionId, trimmed);
      } catch (error) {
        showToast({
          variant: 'error',
          title: 'Failed to send transcript',
          message: getErrorMessage(error),
        });
      } finally {
        setIsSending(false);
      }
    },
    [connect, currentBrand, ensureSession, isConnected, sessionId, showToast, tenant, triggerBargeIn]
  );

  const handleRecordingStop = useCallback(async () => {
    setIsRecording(false);
    stopAndReleaseRecordingStream();
    const audioBlob = new Blob(recordedChunksRef.current, {
      type: recordedChunksRef.current.length ? 'audio/webm' : 'application/octet-stream',
    });
    recordedChunksRef.current = [];

    if (!audioBlob.size) {
      return;
    }

    setIsTranscribing(true);
    sttAbortControllerRef.current = new AbortController();

    try {
      const transcript = await transcribeWithElevenLabs({
        apiKey: apiKey.trim(),
        audioBlob,
        modelId: sttModel,
        signal: sttAbortControllerRef.current.signal,
      });

      await sendTranscriptToAgent(transcript);
    } catch (error) {
      if (sttAbortControllerRef.current?.signal.aborted) {
        return;
      }
      showToast({
        variant: 'error',
        title: 'Voice transcription failed',
        message: getErrorMessage(error),
      });
    } finally {
      setIsTranscribing(false);
      sttAbortControllerRef.current = null;
    }
  }, [apiKey, sendTranscriptToAgent, showToast, sttModel, stopAndReleaseRecordingStream]);

  const startRecording = useCallback(async () => {
    if (!apiKey.trim()) {
      showToast({
        variant: 'error',
        title: 'ElevenLabs key required',
        message: 'Enter an ElevenLabs API key to start voice capture.',
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast({
        variant: 'error',
        title: 'Microphone unavailable',
        message: 'Your environment does not support MediaRecorder audio capture.',
      });
      return;
    }

    try {
      if (!sessionId) {
        await ensureSession();
      } else if (!isConnected) {
        connect();
      }
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to prepare voice session',
        message: getErrorMessage(error),
      });
      return;
    }

    triggerBargeIn();

    try {
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
      recorder.onstop = () => {
        void handleRecordingStop();
      };

      recorder.start(250);
      setIsRecording(true);
    } catch (error) {
      stopAndReleaseRecordingStream();
      showToast({
        variant: 'error',
        title: 'Unable to access microphone',
        message: getErrorMessage(error),
      });
    }
  }, [
    apiKey,
    connect,
    ensureSession,
    handleRecordingStop,
    isConnected,
    sessionId,
    showToast,
    stopAndReleaseRecordingStream,
    triggerBargeIn,
  ]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Session is auto-provisioned on first send or mic press via ensureSession().

  const handleManualSend = useCallback(async () => {
    const transcript = manualInput.trim();
    if (!transcript) {
      return;
    }

    setManualInput('');
    await sendTranscriptToAgent(transcript);
  }, [manualInput, sendTranscriptToAgent]);

  useEffect(() => {
    const storedVoiceId = readStoredValue(STORAGE_KEYS.voiceId);
    const storedSttModel = readStoredValue(STORAGE_KEYS.sttModel);
    const storedTtsModel = readStoredValue(STORAGE_KEYS.ttsModel);
    const storedAssistantFocus = readStoredValue(STORAGE_KEYS.assistantFocus);
    const storedResponseDepth = readStoredValue(STORAGE_KEYS.responseDepth);
    if (storedVoiceId) {
      setVoiceId(storedVoiceId);
    }
    if (storedSttModel === 'scribe_v1' || storedSttModel === 'scribe_v2') {
      setSttModel(storedSttModel);
    }
    if (storedTtsModel) {
      setTtsModel(storedTtsModel);
    }
    if (
      storedAssistantFocus === 'support' ||
      storedAssistantFocus === 'operations' ||
      storedAssistantFocus === 'growth'
    ) {
      setAssistantFocus(storedAssistantFocus);
    }
    if (
      storedResponseDepth === 'concise' ||
      storedResponseDepth === 'balanced' ||
      storedResponseDepth === 'detailed'
    ) {
      setResponseDepth(storedResponseDepth);
    }
    setAutoSpeak(readStoredBoolean(STORAGE_KEYS.autoSpeak, true));
  }, []);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.voiceId, voiceId);
  }, [voiceId]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.sttModel, sttModel);
  }, [sttModel]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.ttsModel, ttsModel);
  }, [ttsModel]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.autoSpeak, String(autoSpeak));
  }, [autoSpeak]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.assistantFocus, assistantFocus);
  }, [assistantFocus]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.responseDepth, responseDepth);
  }, [responseDepth]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    connect();
  }, [connect, sessionId]);

  useEffect(() => {
    return () => {
      disconnect();
      stopAndReleaseRecordingStream(true);
      stopSpeaking();
      if (sttAbortControllerRef.current) {
        sttAbortControllerRef.current.abort();
      }
    };
  }, [disconnect, stopAndReleaseRecordingStream, stopSpeaking]);

  // Auto-scroll conversation to bottom on new messages
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const inputClasses =
    'w-full rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-gray-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35';
  const selectClasses =
    'w-full rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35';

  return (
    <div className="page-shell h-full">
      <div className="content-card relative h-full overflow-hidden p-0 flex flex-col">
        {/* ── Header bar ── */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 shrink-0">
          <span
            className={clsx(
              'inline-flex items-center gap-2 text-xs font-medium',
              isConnected ? 'text-emerald-400' : 'text-slate-400'
            )}
          >
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                isConnected
                  ? 'bg-emerald-400'
                  : isConnecting || isProvisioningSession
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-500'
              )}
            />
            {streamStatusLabel}
          </span>

          <h1 className="text-sm font-semibold text-gray-200">Voice</h1>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={clsx(
                'rounded-lg p-1.5 transition-colors',
                showSettings
                  ? 'bg-slate-700/60 text-brand-300'
                  : 'text-slate-400 hover:text-gray-200 hover:bg-slate-800/60'
              )}
              aria-label="Toggle settings"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="rounded-lg p-1.5 text-slate-400 hover:text-gray-200 hover:bg-slate-800/60 transition-colors"
              aria-label="Reset session"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* ── Collapsible settings panel ── */}
        <AnimatePresence initial={false}>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="overflow-hidden border-b border-slate-700/50 shrink-0"
            >
              <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      ElevenLabs API Key
                    </span>
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="password"
                      placeholder="xi-..."
                      className={inputClasses}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      Voice ID
                    </span>
                    <input
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className={inputClasses}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      STT Model
                    </span>
                    <select
                      value={sttModel}
                      onChange={(e) => setSttModel(e.target.value as ElevenLabsSttModel)}
                      className={selectClasses}
                    >
                      <option value="scribe_v1">scribe_v1</option>
                      <option value="scribe_v2">scribe_v2</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      TTS Model
                    </span>
                    <input
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className={inputClasses}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      Focus
                    </span>
                    <select
                      value={assistantFocus}
                      onChange={(e) => setAssistantFocus(e.target.value as AssistantFocus)}
                      className={selectClasses}
                    >
                      <option value="support">Customer Support</option>
                      <option value="operations">Operations</option>
                      <option value="growth">Growth</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">
                      Depth
                    </span>
                    <select
                      value={responseDepth}
                      onChange={(e) => setResponseDepth(e.target.value as ResponseDepth)}
                      className={selectClasses}
                    >
                      <option value="concise">Concise</option>
                      <option value="balanced">Balanced</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAutoSpeak((v) => !v)}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      autoSpeak
                        ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-700/60 bg-slate-900/70 text-slate-400 hover:text-gray-200'
                    )}
                  >
                    <span
                      className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        autoSpeak ? 'bg-emerald-400' : 'bg-slate-500'
                      )}
                    />
                    Auto-speak {autoSpeak ? 'on' : 'off'}
                  </button>

                  <p className="text-[11px] text-slate-500">
                    API keys are kept in-memory only.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Conversation area ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-full">
            {conversation.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
                {/* ── Floating orb (matches stateset-one landing globe) ── */}
                <div className="relative w-48 h-48">
                  {/* Outer glow ring — ping */}
                  <div
                    className={clsx(
                      'absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 transition-all duration-1000',
                      isRecording
                        ? 'scale-[1.4] opacity-[0.35]'
                        : isConnected
                          ? 'scale-[1.15] opacity-[0.18]'
                          : 'scale-110 opacity-[0.12]'
                    )}
                    style={reduceMotion ? undefined : { animation: 'ping 6s cubic-bezier(0,0,0.2,1) infinite' }}
                  />

                  {/* Middle glow ring — pulse */}
                  <div
                    className={clsx(
                      'absolute inset-0 rounded-full bg-gradient-to-r from-purple-300 to-cyan-300 transition-all duration-700',
                      isRecording
                        ? 'scale-125 opacity-[0.4]'
                        : isConnected
                          ? 'scale-110 opacity-[0.22]'
                          : 'scale-105 opacity-[0.16]'
                    )}
                    style={reduceMotion ? undefined : { animation: 'pulse 5s cubic-bezier(0.4,0,0.6,1) infinite' }}
                  />

                  {/* Main globe */}
                  <div
                    className={clsx(
                      'relative w-48 h-48 rounded-full bg-gradient-to-br from-purple-500 via-purple-400 to-cyan-400 shadow-2xl overflow-hidden transition-all duration-1000',
                      isRecording
                        ? 'shadow-purple-500/50'
                        : isConnected
                          ? 'shadow-emerald-500/25'
                          : 'shadow-slate-500/20'
                    )}
                    style={reduceMotion ? undefined : { animation: 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite' }}
                  >
                    {/* Animated gradient overlay */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-transparent via-white/25 to-transparent"
                      style={reduceMotion ? undefined : { animation: 'pulse 6s cubic-bezier(0.4,0,0.6,1) infinite' }}
                    />

                    {/* Depth gradient */}
                    <div
                      className="absolute inset-0 bg-gradient-to-tr from-purple-600/40 via-transparent to-cyan-300/40"
                      style={reduceMotion ? undefined : { animation: 'pulse 7s cubic-bezier(0.4,0,0.6,1) infinite', animationDelay: '1s' }}
                    />

                    {/* Inner rotating ring */}
                    <div
                      className={clsx(
                        'absolute inset-6 border-2 rounded-full',
                        isRecording
                          ? 'border-yellow-300/50'
                          : isConnected
                            ? 'border-white/35'
                            : 'border-white/15'
                      )}
                      style={reduceMotion ? undefined : { animation: `spin ${isRecording ? '8s' : '30s'} linear infinite` }}
                    />

                    {/* Voice recording indicator */}
                    {isRecording && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-20 h-20 border-[3px] border-yellow-300 rounded-full border-t-transparent"
                          style={reduceMotion ? undefined : { animation: 'spin 3s linear infinite' }}
                        />
                      </div>
                    )}

                    {/* Center icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isTranscribing ? (
                        <Loader2 className="w-10 h-10 text-white animate-spin" aria-hidden="true" />
                      ) : isRecording ? (
                        <Mic className="w-10 h-10 text-white drop-shadow-lg" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-10 h-10 text-white/80 drop-shadow-lg" aria-hidden="true" />
                      )}
                    </div>
                  </div>

                  {/* Connection status dot */}
                  <div
                    className={clsx(
                      'absolute top-2 right-2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-colors duration-500',
                      isRecording
                        ? 'bg-yellow-400'
                        : isConnected
                          ? 'bg-emerald-400'
                          : 'bg-slate-400'
                    )}
                    style={isRecording && !reduceMotion ? { animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' } : undefined}
                  />
                </div>

                <p className="text-sm text-slate-400">How can I help you today?</p>

                {/* Quick action chips */}
                <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                  {quickActionPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendTranscriptToAgent(prompt)}
                      disabled={isSending}
                      className="rounded-full border border-slate-700/60 bg-slate-900/55 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800/80 hover:text-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 space-y-3">
                {conversation.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={clsx(
                      'flex',
                      message.role === 'user'
                        ? 'justify-end'
                        : message.role === 'system'
                          ? 'justify-center'
                          : 'justify-start'
                    )}
                  >
                    <div
                      className={clsx(
                        'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
                        message.role === 'user'
                          ? 'bg-brand-500/15 border border-brand-500/25 text-gray-100'
                          : message.role === 'assistant'
                            ? 'bg-slate-800/60 border border-slate-700/50 text-gray-200'
                            : 'bg-slate-900/40 border border-slate-700/40 text-slate-400 text-xs'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <p
                        className={clsx(
                          'mt-1.5 text-[10px]',
                          message.role === 'user' ? 'text-brand-300/50 text-right' : 'text-slate-500'
                        )}
                      >
                        {formatEventTime(message.timestamp)}
                      </p>
                    </div>
                  </motion.div>
                ))}
                <div ref={conversationEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom input bar ── */}
        <div className="border-t border-slate-700/50 bg-slate-950/80 backdrop-blur-sm px-4 py-3 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleManualSend();
                }
              }}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2.5 text-sm text-gray-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35"
            />

            {/* Mic button with orb-style glow */}
            <div className="relative">
              {/* Outer glow — matches the orb palette */}
              {!reduceMotion && (
                <span
                  className={clsx(
                    'absolute -inset-2 rounded-full transition-opacity duration-500',
                    isRecording
                      ? 'bg-gradient-to-r from-purple-400/40 to-cyan-400/40 opacity-100'
                      : 'bg-gradient-to-r from-purple-400/15 to-cyan-400/15 opacity-0 group-hover:opacity-100'
                  )}
                  style={isRecording ? { animation: 'ping 3s cubic-bezier(0,0,0.2,1) infinite' } : undefined}
                />
              )}
              {isRecording && !reduceMotion && (
                <motion.span
                  className="absolute -inset-1 rounded-full border-2 border-purple-400/60"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.25, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!isRecording && canRecord) {
                    triggerBargeIn();
                    void startRecording();
                  }
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  if (isRecording) {
                    stopRecording();
                  }
                }}
                onPointerCancel={() => {
                  if (isRecording) {
                    stopRecording();
                  }
                }}
                onPointerLeave={() => {
                  if (isRecording) {
                    stopRecording();
                  }
                }}
                disabled={!canRecord}
                className={clsx(
                  'relative w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed',
                  isRecording
                    ? 'bg-gradient-to-br from-purple-500 to-cyan-400 text-white shadow-lg shadow-purple-500/30'
                    : 'border-2 border-slate-600 bg-slate-800 text-slate-300 hover:border-purple-400/50 hover:text-white hover:shadow-lg hover:shadow-purple-500/20'
                )}
                aria-label={isRecording ? 'Release to send' : 'Hold to talk'}
              >
                {isTranscribing ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Mic className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={() => void handleManualSend()}
              disabled={!manualInput.trim() || isSending}
              className="rounded-xl border border-brand-500/40 bg-brand-500/20 px-3.5 py-2.5 text-sm font-medium text-sky-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-500/30"
              aria-label="Send message"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Status text below input when active */}
          <AnimatePresence>
            {(isRecording || isTranscribing || isSpeaking) && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-center text-xs text-slate-400 mt-2"
              >
                {isRecording
                  ? 'Listening… release to send'
                  : isTranscribing
                    ? 'Transcribing…'
                    : 'Speaking…'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
