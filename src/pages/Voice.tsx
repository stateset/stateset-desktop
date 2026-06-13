import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuthStore } from '../stores/auth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ToastProvider';
import { agentApi } from '../lib/api';
import { useAgentStream } from '../hooks/useAgentStream';
import { getErrorMessage } from '../lib/errors';
import { requireBrandId, requireTenantId } from '../lib/auth-guards';
import {
  ConversationList,
  VoiceEmptyState,
  VoiceHeader,
  VoiceInputBar,
  VoiceSettingsPanel,
  getQuickActionPrompts,
  getStreamStatusLabel,
  mapStreamMessagesToConversation,
  useVoiceRecorder,
  useVoiceSession,
  useVoiceSettings,
  useVoiceSynthesis,
  useVoiceTranscription,
} from '../features/voice';

export default function Voice() {
  usePageTitle('Voice');
  const reduceMotion = useReducedMotion() ?? false;
  const tenant = useAuthStore((state) => state.tenant);
  const currentBrand = useAuthStore((state) => state.currentBrand);
  const { showToast } = useToast();

  const {
    apiKey,
    setApiKey,
    voiceId,
    setVoiceId,
    sttModel,
    setSttModel,
    ttsModel,
    setTtsModel,
    assistantFocus,
    setAssistantFocus,
    responseDepth,
    setResponseDepth,
    autoSpeak,
    toggleAutoSpeak,
  } = useVoiceSettings();

  const [isSending, setIsSending] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const conversationEndRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    isCaptureSupported,
    startCapture,
    stopCapture,
    finishCapture,
    releaseCapture,
  } = useVoiceRecorder();
  const { isTranscribing, transcribe, abortTranscription } = useVoiceTranscription();
  const {
    isSpeaking,
    speak,
    stopSpeaking,
    triggerBargeIn,
    isInBargeInCooldown,
    hasSpokenMessage,
    markMessageSpoken,
    resetSpokenMessages,
  } = useVoiceSynthesis();

  const handleSessionReady = useCallback(() => {
    resetSpokenMessages();
    showToast({
      variant: 'success',
      title: 'Voice session ready',
      message: 'Session created. Stream will connect automatically.',
    });
  }, [resetSpokenMessages, showToast]);

  const { sessionId, setSessionId, isProvisioningSession, ensureSession } = useVoiceSession({
    tenant,
    currentBrand,
    assistantFocus,
    responseDepth,
    onSessionReady: handleSessionReady,
  });

  const { isConnected, isConnecting, messages, connect, disconnect, clearEvents } = useAgentStream({
    tenantId: tenant?.id ?? '',
    brandId: currentBrand?.id ?? '',
    sessionId: sessionId ?? '',
    autoReconnect: true,
    onEvent: (event) => {
      if (event.type !== 'message' || event.role !== 'assistant') {
        return;
      }

      if (isInBargeInCooldown()) {
        return;
      }

      if (isRecording || isTranscribing || isSending) {
        return;
      }

      if (!autoSpeak || !apiKey.trim() || !voiceId.trim()) {
        return;
      }

      if (hasSpokenMessage(event.id)) {
        return;
      }
      markMessageSpoken(event.id);

      void speak({
        apiKey: apiKey.trim(),
        voiceId: voiceId.trim(),
        text: event.content,
        modelId: ttsModel,
      }).catch((error) => {
        showToast({
          variant: 'error',
          title: 'Voice playback failed',
          message: getErrorMessage(error),
        });
      });
    },
    onError: (message) => {
      showToast({
        variant: 'error',
        title: 'Stream connection issue',
        message,
      });
    },
  });

  const conversation = useMemo(() => mapStreamMessagesToConversation(messages), [messages]);

  const canRecord =
    Boolean(apiKey.trim()) && !isProvisioningSession && !isSending && !isTranscribing;

  const streamStatusLabel = useMemo(
    () =>
      getStreamStatusLabel({
        isTranscribing,
        isRecording,
        isSpeaking,
        isConnecting,
        isProvisioningSession,
        isConnected,
        hasSession: Boolean(sessionId),
      }),
    [
      isConnected,
      isConnecting,
      isProvisioningSession,
      isRecording,
      isSpeaking,
      isTranscribing,
      sessionId,
    ]
  );

  const quickActionPrompts = useMemo(() => getQuickActionPrompts(assistantFocus), [assistantFocus]);

  const resetSession = useCallback(() => {
    disconnect();
    setSessionId(null);
    resetSpokenMessages();
    clearEvents();
    stopSpeaking();
    showToast({
      variant: 'success',
      title: 'Voice session reset',
      message: 'A new session will be created with your current voice profile.',
    });
  }, [clearEvents, disconnect, resetSpokenMessages, setSessionId, showToast, stopSpeaking]);

  const sendTranscriptToAgent = useCallback(
    async (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        return;
      }

      triggerBargeIn();
      setIsSending(true);

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
    [
      connect,
      currentBrand,
      ensureSession,
      isConnected,
      sessionId,
      showToast,
      tenant,
      triggerBargeIn,
    ]
  );

  const handleRecordingStop = useCallback(async () => {
    const audioBlob = finishCapture();

    if (!audioBlob.size) {
      return;
    }

    try {
      const transcript = await transcribe({
        apiKey: apiKey.trim(),
        audioBlob,
        modelId: sttModel,
      });

      if (transcript === null) {
        return;
      }

      await sendTranscriptToAgent(transcript);
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Voice transcription failed',
        message: getErrorMessage(error),
      });
    }
  }, [apiKey, finishCapture, sendTranscriptToAgent, showToast, sttModel, transcribe]);

  const startRecording = useCallback(async () => {
    if (!apiKey.trim()) {
      showToast({
        variant: 'error',
        title: 'ElevenLabs key required',
        message: 'Enter an ElevenLabs API key to start voice capture.',
      });
      return;
    }

    if (!isCaptureSupported()) {
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
      await startCapture(() => {
        void handleRecordingStop();
      });
    } catch (error) {
      releaseCapture();
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
    isCaptureSupported,
    isConnected,
    releaseCapture,
    sessionId,
    showToast,
    startCapture,
    triggerBargeIn,
  ]);

  // Session is auto-provisioned on first send or mic press via ensureSession().

  const handleManualSend = useCallback(async () => {
    const transcript = manualInput.trim();
    if (!transcript) {
      return;
    }

    setManualInput('');
    await sendTranscriptToAgent(transcript);
  }, [manualInput, sendTranscriptToAgent]);

  const handleRecordStart = useCallback(() => {
    triggerBargeIn();
    void startRecording();
  }, [startRecording, triggerBargeIn]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    connect();
  }, [connect, sessionId]);

  useEffect(() => {
    return () => {
      disconnect();
      releaseCapture(true);
      stopSpeaking();
      abortTranscription();
    };
  }, [abortTranscription, disconnect, releaseCapture, stopSpeaking]);

  // Auto-scroll conversation to bottom on new messages
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  return (
    <div className="page-shell h-full">
      <div className="content-card relative h-full overflow-hidden p-0 flex flex-col">
        <VoiceHeader
          statusLabel={streamStatusLabel}
          isConnected={isConnected}
          isConnecting={isConnecting}
          isProvisioningSession={isProvisioningSession}
          showSettings={showSettings}
          hasApiKey={Boolean(apiKey.trim())}
          onToggleSettings={() => setShowSettings((v) => !v)}
          onResetSession={resetSession}
        />

        <VoiceSettingsPanel
          open={showSettings}
          reduceMotion={reduceMotion}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          voiceId={voiceId}
          onVoiceIdChange={setVoiceId}
          sttModel={sttModel}
          onSttModelChange={setSttModel}
          ttsModel={ttsModel}
          onTtsModelChange={setTtsModel}
          assistantFocus={assistantFocus}
          onAssistantFocusChange={setAssistantFocus}
          responseDepth={responseDepth}
          onResponseDepthChange={setResponseDepth}
          autoSpeak={autoSpeak}
          onToggleAutoSpeak={toggleAutoSpeak}
        />

        {/* ── Conversation area ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-full">
            {conversation.length === 0 ? (
              <VoiceEmptyState
                isRecording={isRecording}
                isConnected={isConnected}
                isTranscribing={isTranscribing}
                isSending={isSending}
                reduceMotion={reduceMotion}
                hasApiKey={Boolean(apiKey.trim())}
                quickActionPrompts={quickActionPrompts}
                onOpenSettings={() => setShowSettings(true)}
                onSelectPrompt={(prompt) => void sendTranscriptToAgent(prompt)}
              />
            ) : (
              <ConversationList
                conversation={conversation}
                reduceMotion={reduceMotion}
                endRef={conversationEndRef}
              />
            )}
          </div>
        </div>

        <VoiceInputBar
          manualInput={manualInput}
          onManualInputChange={setManualInput}
          onManualSend={() => void handleManualSend()}
          canRecord={canRecord}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          isSpeaking={isSpeaking}
          isSending={isSending}
          reduceMotion={reduceMotion}
          onRecordStart={handleRecordStart}
          onRecordStop={stopCapture}
        />
      </div>
    </div>
  );
}
