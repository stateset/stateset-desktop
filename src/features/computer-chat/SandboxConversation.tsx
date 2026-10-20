import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Camera, Pause, Square } from 'lucide-react';
import { ChatInput } from '../chat-playground/components/ChatInput';
import { computerChatRuntime } from './runtime';
import { useComputerChatsStore } from './store';
import { conversationStatus } from './presentation';
import type { ComputerChat } from './types';
import { SandboxArtifactPanel } from './SandboxArtifactPanel';
import { ActionRecoveryPanel } from './ActionRecoveryPanel';
import { actionRecovery } from './actionRecovery';
import { ConversationTranscript } from './ConversationTranscript';
import {
  DEFAULT_SANDBOX_PREFERENCES,
  sandboxPreferencesKey,
  sandboxPreferencesSchema,
} from './sandboxPreferences';

export { SandboxChatSetup } from './SandboxChatSetup';

export function SandboxConversation({
  chat,
  busy,
  onSettings,
}: {
  chat: ComputerChat;
  busy: boolean;
  onSettings: () => void;
}) {
  const preferences =
    useComputerChatsStore((state) => state.sandboxPreferences[sandboxPreferencesKey(chat)]) ??
    DEFAULT_SANDBOX_PREFERENCES;
  const [model, setModel] = useState(preferences.model);
  const [verify, setVerify] = useState(preferences.verify);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const preferencesInFlight = useRef(false);
  const modelInput = useRef<HTMLInputElement>(null);
  const preferencesSaveButton = useRef<HTMLButtonElement>(null);
  const restorePreferencesFocus = useRef(false);
  const modelIssueId = useId();
  const preferencesAlive = useRef(true);
  useEffect(() => {
    preferencesAlive.current = true;
    return () => {
      preferencesAlive.current = false;
    };
  }, []);
  const parsedPreferences = sandboxPreferencesSchema.safeParse({ model, verify });
  const preferencesIssue = parsedPreferences.success
    ? ''
    : parsedPreferences.error.issues[0].message;
  const preferencesDirty = model.trim() !== preferences.model || verify !== preferences.verify;
  const preferencesBlocked = savingPreferences || preferencesDirty || Boolean(preferencesIssue);
  const options = { ...preferences, durable: false };
  useLayoutEffect(() => {
    if (savingPreferences || !restorePreferencesFocus.current) return;
    restorePreferencesFocus.current = false;
    if (
      document.activeElement === document.body ||
      document.activeElement === preferencesSaveButton.current
    )
      modelInput.current?.focus();
  }, [savingPreferences]);
  const savePreferences = async () => {
    if (preferencesInFlight.current || !parsedPreferences.success) return;
    preferencesInFlight.current = true;
    restorePreferencesFocus.current = document.activeElement === preferencesSaveButton.current;
    setSavingPreferences(true);
    setPreferencesError('');
    setPreferencesSaved(false);
    try {
      await useComputerChatsStore.getState().setSandboxPreferences(chat.id, parsedPreferences.data);
      if (preferencesAlive.current) {
        setModel(parsedPreferences.data.model);
        setPreferencesSaved(true);
      }
    } catch (error) {
      if (preferencesAlive.current)
        setPreferencesError(error instanceof Error ? error.message : String(error));
    } finally {
      preferencesInFlight.current = false;
      if (preferencesAlive.current) setSavingPreferences(false);
    }
  };
  const ready =
    !chat.sandboxStopRequested &&
    chat.session?.status === 'running' &&
    Boolean(chat.session.currentSandboxId);
  const activity = useComputerChatsStore((state) => state.activities[chat.id]);
  const activityKind = activity?.kind ?? (ready ? 'agent' : 'setup');
  const pausing = Boolean(activity?.pausing);
  const canPause =
    busy && activityKind !== 'shutdown' && activityKind !== 'status' && !chat.stopped;
  const status = conversationStatus(
    chat,
    undefined,
    busy
      ? (activity ?? {
          kind: chat.sandboxStopRequested ? 'shutdown' : activityKind,
          pausing: false,
        })
      : undefined
  );
  const recovery = actionRecovery(chat);
  const allowDraftEditing = !chat.stopped && !chat.sandboxStopRequested;
  const draftHint = !allowDraftEditing
    ? undefined
    : pausing
      ? 'Pause requested. You can keep drafting; nothing sends automatically.'
      : recovery
        ? 'You can edit your draft while reviewing the pending action. Nothing sends automatically.'
        : preferencesBlocked
          ? 'Save your preferences under Computer and permissions before sending. Your draft stays here.'
          : !ready
            ? 'You can draft now. Sending becomes available when your computer is ready.'
            : busy
              ? activityKind === 'status'
                ? 'Checking computer status. Your draft stays editable.'
                : 'You can draft your next message while work continues. Nothing sends automatically.'
              : undefined;
  const emptyMessage = chat.stopped
    ? 'This computer has ended. Your chat is saved. Start a new chat to continue.'
    : chat.sandboxStopRequested
      ? 'Computer shutdown is unconfirmed. Your chat and draft are saved.'
      : recovery
        ? 'Review the pending action below before continuing this conversation.'
        : chat.pauseNotice
          ? 'Your work is paused. Your chat and draft are saved.'
          : ready
            ? 'Your computer is ready. What would you like to work on?'
            : busy
              ? 'Your chat is saved. Its computer is being prepared in the background.'
              : chat.error
                ? 'Your chat is saved. Review the setup error above before continuing.'
                : 'Your chat is saved. Check computer setup to continue.';
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
              {status.label}
            </p>
            {!preferences.verify && (
              <p className="chat-setup-warning mt-1 text-xs">NSR policy checks off</p>
            )}
          </div>
          {canPause && (
            <button
              type="button"
              className="minimal-secondary-button"
              disabled={pausing}
              onClick={() => computerChatRuntime.pause(chat.id)}
            >
              <Pause className="h-3.5 w-3.5" />
              {pausing ? 'Pausing…' : activityKind === 'setup' ? 'Pause setup' : 'Pause work'}
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
        {pausing && (
          <p className="m-3 text-xs text-gray-500">
            Waiting for the current request. Your computer may still be running; use Stop computer
            after work pauses to end it.
          </p>
        )}
        {chat.pauseNotice && !busy && (
          <p role="status" aria-label="Pause notice" className="m-3 text-xs text-gray-500">
            {chat.pauseNotice}
          </p>
        )}
        {chat.agentTurnUnfinished &&
          !busy &&
          !chat.stopped &&
          !chat.sandboxStopRequested &&
          !chat.pending && (
            <p role="status" aria-label="Unfinished task" className="m-3 text-xs text-gray-500">
              Your last task did not finish.{' '}
              {ready ? 'Send a follow-up to continue.' : 'Check computer setup before continuing.'}{' '}
              Reopening this chat does not resume work automatically.
            </p>
          )}
        {chat.error && (
          <div className="m-3 space-y-2">
            <p role="alert" className="text-xs text-red-400">
              {chat.error}
            </p>
            {ready && !busy && !chat.stopped && (!recovery || recovery.action === 'resume') && (
              <button type="button" className="minimal-secondary-button" onClick={onSettings}>
                Connection settings
              </button>
            )}
          </div>
        )}
        {!busy && !chat.stopped && !chat.sandboxStopRequested && !ready && !chat.pending && (
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
        <ConversationTranscript key={chat.id} chat={chat} emptyMessage={emptyMessage} />
        <ChatInput
          value={chat.draft ?? ''}
          onChange={(draft) => useComputerChatsStore.getState().setDraft(chat.id, draft)}
          onBlur={() =>
            void useComputerChatsStore
              .getState()
              .flushDrafts()
              .catch(() => undefined)
          }
          maxBytes={8000}
          isLoading={busy}
          disabled={!ready || Boolean(chat.pending) || Boolean(chat.stopped) || preferencesBlocked}
          allowDraftEditing={allowDraftEditing}
          hint={draftHint}
          placeholder={
            chat.stopped
              ? 'Computer stopped. Start a new chat to continue.'
              : chat.sandboxStopRequested
                ? 'Computer shutdown pending.'
                : chat.pending
                  ? 'Review the pending action below to continue.'
                  : !ready
                    ? busy
                      ? 'Preparing your computer…'
                      : 'Computer not ready. Check setup above.'
                    : undefined
          }
          onSend={(text) => void computerChatRuntime.send(chat.id, text, options)}
        />
        <section
          aria-label="Computer tools"
          tabIndex={0}
          className="max-h-[45%] shrink-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-500/40"
        >
          {chat.pending && !chat.stopped && !chat.sandboxStopRequested && (
            <ActionRecoveryPanel key={chat.pending.requestId} chat={chat} busy={busy} />
          )}
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
                ref={modelInput}
                aria-label="Sandbox chat model"
                value={model}
                disabled={
                  busy ||
                  savingPreferences ||
                  Boolean(chat.pending) ||
                  Boolean(chat.stopped) ||
                  Boolean(chat.sandboxStopRequested)
                }
                aria-invalid={Boolean(preferencesIssue) || undefined}
                aria-describedby={preferencesIssue ? modelIssueId : undefined}
                onChange={(event) => {
                  setModel(event.target.value);
                  setPreferencesError('');
                  setPreferencesSaved(false);
                }}
                className="minimal-input mt-1 block"
              />
            </label>
            <label className="mt-3 flex gap-2">
              <input
                type="checkbox"
                checked={verify}
                disabled={
                  busy ||
                  savingPreferences ||
                  Boolean(chat.pending) ||
                  Boolean(chat.stopped) ||
                  Boolean(chat.sandboxStopRequested)
                }
                onChange={(event) => {
                  setVerify(event.target.checked);
                  setPreferencesError('');
                  setPreferencesSaved(false);
                }}
              />
              Check execution policy with NSR
            </label>
            {preferencesIssue && (
              <p id={modelIssueId} role="alert" className="mt-2 ui-negative">
                {preferencesIssue}
              </p>
            )}
            {preferencesError && (
              <p role="alert" className="mt-2 ui-negative">
                {preferencesError} Your entries are retained; try saving again.
              </p>
            )}
            {preferencesDirty && (
              <p className="mt-2 text-gray-500">
                Unsaved preferences. Save before starting new work.
              </p>
            )}
            <button
              ref={preferencesSaveButton}
              type="button"
              className="minimal-secondary-button mt-3"
              disabled={
                !preferencesDirty ||
                Boolean(preferencesIssue) ||
                savingPreferences ||
                busy ||
                Boolean(chat.pending) ||
                Boolean(chat.stopped) ||
                Boolean(chat.sandboxStopRequested)
              }
              onClick={() => void savePreferences()}
            >
              {savingPreferences ? 'Saving preferences…' : 'Save preferences'}
            </button>
            {preferencesSaved && (
              <p role="status" className="mt-2 text-gray-500">
                Preferences saved for this chat
              </p>
            )}
            <p className="mt-2 text-gray-500">
              Checks cover action permissions and exit status. File contents and answer accuracy
              require separate verification.
            </p>
            {!verify && (
              <p className="chat-setup-warning mt-2">
                {preferences.verify
                  ? 'Save to turn off policy checks for new actions in this conversation.'
                  : 'Policy checks are off for new actions in this conversation.'}
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
              disabled={
                busy ||
                !ready ||
                Boolean(chat.pending) ||
                Boolean(chat.stopped) ||
                preferencesBlocked
              }
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
          <SandboxArtifactPanel chat={chat} busy={busy} />
        </section>
      </div>
    </div>
  );
}
