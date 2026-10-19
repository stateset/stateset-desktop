import { useEffect, useRef, useState } from 'react';
import { Camera, Pause, Square } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { localSecretsApi } from '../../lib/localSecrets';
import { useSecureStorageAvailability } from '../../hooks/useSecureStorageAvailability';
import { ChatInput } from '../chat-playground/components/ChatInput';
import { ChatMessageBubble } from '../chat-playground/components/ChatMessageBubble';
import { ToolActivityBubble } from '../chat-playground/components/ToolActivityBubble';
import { POLICY_CONNECTION } from './api';
import { computerChatRuntime } from './runtime';
import { useComputerChatsStore } from './store';
import { conversationStatus } from './presentation';
import type { ComputerChat } from './types';

export function SandboxChatSetup({
  tenantId,
  brandId,
  onError,
}: {
  tenantId: string;
  brandId: string;
  onError: (message: string) => void;
}) {
  const savedKey = useAuthStore((state) => Boolean(state.sandboxApiKey));
  const secureStorage = useSecureStorageAvailability();
  const [key, setKey] = useState('');
  const [policyKey, setPolicyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaved(false);
    onError('');
    try {
      if (key.trim()) await useAuthStore.getState().setSandboxApiKey(key.trim());
      if (policyKey.trim())
        await localSecretsApi.storeCredentials(tenantId, brandId, POLICY_CONNECTION, {
          api_key: policyKey.trim(),
        });
      if (alive.current) {
        setKey('');
        setPolicyKey('');
        setSaved(true);
      }
    } catch {
      if (alive.current)
        onError('The API keys could not be saved. Your entries are still here; try again.');
    } finally {
      inFlight.current = false;
      if (alive.current) setSaving(false);
    }
  };
  return (
    <section aria-label="Sandbox connection" className="space-y-3 text-xs">
      <p className="text-gray-400">
        Each new chat creates a dedicated computer through the Sandbox API. No workflow engine
        connection is required.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-gray-400">
          Sandbox API key
          <input
            type="password"
            autoComplete="off"
            value={key}
            disabled={saving}
            onChange={(event) => {
              setKey(event.target.value);
              setSaved(false);
            }}
            placeholder={savedKey ? 'Use saved key' : 'Enter your API key'}
            className="minimal-input mt-1 w-full"
          />
        </label>
        <label className="text-gray-400">
          NSR policy API key
          <input
            type="password"
            autoComplete="off"
            value={policyKey}
            disabled={saving}
            onChange={(event) => {
              setPolicyKey(event.target.value);
              setSaved(false);
            }}
            placeholder="Use saved key"
            className="minimal-input mt-1 w-full"
          />
        </label>
      </div>
      <p className="text-gray-500">
        Computer sessions last up to one hour. Agent work runs while this app is open. The sandbox
        organization supplies the inference credentials; NSR checks require a policy key for the
        same organization.
      </p>
      {secureStorage === false && (
        <p role="status" className="chat-setup-warning">
          Your system keyring is unavailable. The Sandbox API key lasts until you quit the app.
        </p>
      )}
      <button
        type="button"
        className="minimal-primary-button"
        disabled={saving || !(key.trim() || policyKey.trim())}
        onClick={() => void save()}
      >
        {saving ? 'Saving…' : 'Save API keys'}
      </button>
      {saved && (
        <p role="status" className="text-emerald-400">
          API keys saved
        </p>
      )}
    </section>
  );
}

export function SandboxConversation({
  chat,
  busy,
  onSettings,
}: {
  chat: ComputerChat;
  busy: boolean;
  onSettings: () => void;
}) {
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [verify, setVerify] = useState(true);
  const options = { model, verify, durable: false };
  const ready =
    !chat.sandboxStopRequested &&
    chat.session?.status === 'running' &&
    Boolean(chat.session.currentSandboxId);
  const status = conversationStatus(chat);
  useEffect(() => {
    void computerChatRuntime.refresh(chat.id).catch(() => undefined);
  }, [chat.id]);
  return (
    <div className="chat-session">
      <div className="chat-conversation">
        <header className="chat-conversation-header">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">{chat.title}</h2>
            <p role="status" aria-label="Conversation status" className="chat-caption mt-1">
              {busy
                ? chat.sandboxStopRequested
                  ? 'Stopping computer…'
                  : ready
                    ? 'Working'
                    : 'Preparing computer…'
                : status.label}
            </p>
          </div>
          {busy && ready && (
            <button
              type="button"
              className="minimal-secondary-button"
              onClick={() => computerChatRuntime.pause(chat.id)}
            >
              <Pause className="h-3.5 w-3.5" />
              Pause work
            </button>
          )}
          {!chat.stopped && (
            <button
              type="button"
              disabled={busy}
              className="minimal-secondary-button"
              onClick={() => void computerChatRuntime.stop(chat.id)}
            >
              <Square className="h-3.5 w-3.5" />
              {chat.sandboxStopRequested ? 'Check shutdown' : 'Stop computer'}
            </button>
          )}
        </header>
        {chat.error && (
          <p role="alert" className="m-3 text-xs text-red-400">
            {chat.error}
          </p>
        )}
        {!busy && !chat.stopped && !chat.sandboxStopRequested && !ready && (
          <div className="m-3 flex gap-2">
            <button
              type="button"
              className="minimal-secondary-button"
              onClick={() => void computerChatRuntime.provision(chat.id)}
            >
              {chat.sandboxStartUnconfirmed ? 'Check computer setup' : 'Retry computer setup'}
            </button>
            <button type="button" className="minimal-secondary-button" onClick={onSettings}>
              Connection settings
            </button>
          </div>
        )}
        {chat.pending && !busy && !chat.stopped && !chat.sandboxStopRequested && (
          <button
            type="button"
            className="minimal-secondary-button m-3"
            onClick={() => void computerChatRuntime.resume(chat.id)}
          >
            Resume action
          </button>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-label="Chat transcript">
          {!chat.messages.length && (
            <p className="text-sm text-gray-500">
              {ready
                ? 'Your computer is ready. What would you like to work on?'
                : 'Your chat is saved. Its computer is being prepared in the background.'}
            </p>
          )}
          {chat.messages.map((message) =>
            message.role === 'tool' ? (
              <ToolActivityBubble key={message.id} message={message} />
            ) : (
              <ChatMessageBubble key={message.id} message={message} />
            )
          )}
        </div>
        <ChatInput
          value={chat.draft ?? ''}
          onChange={(draft) => useComputerChatsStore.getState().setDraft(chat.id, draft)}
          maxBytes={8000}
          isLoading={busy}
          disabled={!ready || Boolean(chat.pending) || Boolean(chat.stopped)}
          placeholder={
            chat.stopped
              ? 'Computer stopped. Start a new chat to continue.'
              : !ready
                ? 'Preparing your computer…'
                : undefined
          }
          onSend={(text) => void computerChatRuntime.send(chat.id, text, options)}
        />
        <details className="m-3 text-xs text-gray-400">
          <summary>Computer and permissions</summary>
          <p className="mt-2 break-all">
            Sandbox: {chat.session?.currentSandboxId ?? 'Not allocated yet'}
          </p>
          <p className="break-all">Session: {chat.session?.id ?? 'Not allocated yet'}</p>
          <p className="mt-2">
            Agent work pauses when the app closes. The computer remains subject to its one-hour
            session limit. Stop computer ends the session.
          </p>
          <label className="mt-3 block">
            Model
            <input
              aria-label="Sandbox chat model"
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
              className="minimal-input mt-1 block"
            />
          </label>
          <label className="mt-3 flex gap-2">
            <input
              type="checkbox"
              checked={verify}
              disabled={busy || Boolean(chat.pending)}
              onChange={(event) => setVerify(event.target.checked)}
            />
            Check actions and outputs with NSR
          </label>
          {!verify && (
            <p className="chat-setup-warning mt-2">
              Policy checks are off for new actions in this conversation.
            </p>
          )}
          {chat.policy && (
            <p className="mt-2">
              Latest policy {chat.policy.phase}: {chat.policy.verdict}
            </p>
          )}
          <button
            type="button"
            className="minimal-secondary-button mt-3"
            onClick={() => void computerChatRuntime.screenshot(chat.id, options)}
            disabled={busy || !ready || Boolean(chat.pending) || Boolean(chat.stopped)}
          >
            <Camera className="h-3.5 w-3.5" />
            Capture desktop
          </button>
          {chat.screenshot && (
            <img
              src={chat.screenshot}
              alt="Latest screenshot of this chat’s sandbox desktop"
              className="mt-3 max-h-80 rounded-lg"
            />
          )}
        </details>
      </div>
    </div>
  );
}
