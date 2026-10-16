import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Camera,
  Pause,
  Play,
  Square,
  RefreshCw,
  Archive,
  SlidersHorizontal,
  PanelLeft,
  Monitor,
  X,
  MessageSquare,
} from 'lucide-react';
import './computer-chat.css';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { useComputerChatsStore } from './store';
import { durableChatController } from './durable';
import { ChatLibrary } from './ChatLibrary';
import { chatEnded, lastOpenedChat } from './library';
import { conversationStatus } from './presentation';
import { ConnectionNotice } from './ConnectionNotice';
import { ConversationTranscript } from './ConversationTranscript';
import {
  DEFAULT_CHAT_CONFIGURATION,
  terminalChat,
  type DurableChatConfiguration,
} from './durableTypes';
import { DurableChatSetup } from './DurableChatSetup';
import { sameSetupContext, type CheckedSetup, type SetupContext } from './setup';
import {
  ApprovalCard,
  BudgetIndicator,
  Deliverables,
  ExecutionTimeline,
  WorkspaceBrowser,
} from './ExecutionPanels';
import { ChatInput } from '../chat-playground/components/ChatInput';
import { computerChatRuntime } from './runtime';
import { ChatMessageBubble } from '../chat-playground/components/ChatMessageBubble';
import { ToolActivityBubble } from '../chat-playground/components/ToolActivityBubble';
import type { ChatConversation } from '../../types';
import type { ComputerChat } from './types';

export function DurableComputerChat() {
  const tenantId = useAuthStore((s) => s.tenant?.id);
  const brandId = useAuthStore((s) => s.currentBrand?.id);
  const chats = useComputerChatsStore((s) => s.chats);
  const loaded = useComputerChatsStore((s) => s.loaded);
  const busy = useComputerChatsStore((s) => s.busy);
  const initialize = useComputerChatsStore((s) => s.initialize);
  const configurations = useComputerChatsStore((s) => s.configurations);
  const persistenceError = useComputerChatsStore((s) => s.persistenceError);
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = JSON.stringify([tenantId, brandId]);
  const previousScope = useRef(scope);
  const previousScopeReady = useRef(Boolean(tenantId && brandId));
  const requestedId =
    previousScope.current === scope || !previousScopeReady.current
      ? searchParams.get('chat')
      : null;
  const activeId = requestedId ?? lastOpenedChat(chats, tenantId, brandId)?.id;
  const connectionStatus = useComputerChatsStore((s) =>
    activeId ? s.connections[activeId]?.status : undefined
  );
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [configuration, setConfiguration] = useState<DurableChatConfiguration>(
    DEFAULT_CHAT_CONFIGURATION
  );
  const [checkedSetup, setCheckedSetup] = useState<CheckedSetup | null>(null);
  const setupEngineUrl = useDurableWorkflowsStore((s) => s.engineUrl);
  const setupApiKey = useDurableWorkflowsStore((s) => s.apiKey);
  const setupRevision = useDurableWorkflowsStore((s) => s.connectionRevision);
  const setupConfiguring = useDurableWorkflowsStore((s) => s.configuring);
  const setupContext: SetupContext = {
    tenantId: tenantId ?? '',
    brandId: brandId ?? '',
    engineUrl: setupEngineUrl,
    apiKey: setupApiKey,
    connectionRevision: setupRevision,
    configuring: setupConfiguring,
    mcpServers: configuration.mcp_servers,
  };
  const currentSetupContext = useRef(setupContext);
  currentSetupContext.current = setupContext;
  const report =
    checkedSetup && sameSetupContext(checkedSetup.context, setupContext)
      ? checkedSetup.report
      : null;
  const setReport = useCallback((checked: CheckedSetup | null) => {
    if (!checked || sameSetupContext(checked.context, currentSetupContext.current))
      setCheckedSetup(checked);
  }, []);
  const [previous, setPrevious] = useState<ChatConversation[]>([]);
  const [tab, setTab] = useState<'desktop' | 'timeline' | 'files'>('desktop');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const conversationHeading = useRef<HTMLHeadingElement>(null);
  const libraryToggle = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const settingsToggle = useRef<HTMLButtonElement>(null);
  const settingsPanel = useRef<HTMLDivElement>(null);
  const [settingsFocusRequest, setSettingsFocusRequest] = useState(0);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const openLibrary = useCallback(() => {
    setLibraryOpen(true);
    if (window.matchMedia('(max-width: 599px)').matches) setDetailsOpen(false);
  }, []);
  useEffect(() => {
    if (!libraryOpen || !detailsOpen) return;
    const media = window.matchMedia('(max-width: 599px)');
    const reconcile = () => {
      if (!media.matches) return;
      if (document.getElementById('chat-library')?.contains(document.activeElement))
        setDetailsOpen(false);
      else setLibraryOpen(false);
    };
    reconcile();
    media.addEventListener?.('change', reconcile);
    return () => media.removeEventListener?.('change', reconcile);
  }, [libraryOpen, detailsOpen]);
  const closeDetails = () => {
    setDetailsOpen(false);
    inspectorToggle.current?.focus();
  };
  const scoped = chats.filter((c) => c.tenantId === tenantId && c.brandId === brandId);
  const chat = scoped.find((c) => c.id === activeId);
  const state = chat?.serverState;
  const status = chat
    ? conversationStatus(chat, connectionStatus ? { status: connectionStatus } : undefined)
    : undefined;
  const working = Boolean(chat && busy[chat.id]);
  const ended = Boolean(chat && chatEnded(chat));
  const reviewChatId = chat?.id;
  const focusReview = useCallback(() => {
    const panel = conversation.current?.querySelector<HTMLElement>('.chat-approval');
    if (!panel) return;
    panel.scrollTop = 0;
    panel.scrollIntoView({ block: 'nearest' });
    panel.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, []);
  const restoreReviewFocus = useCallback(() => {
    if (!reviewChatId || conversation.current?.dataset.chatId !== reviewChatId) return;
    const reviewHeading = conversation.current.querySelector<HTMLElement>('.chat-approval h2');
    (reviewHeading ?? conversationHeading.current)?.focus({ preventScroll: true });
  }, [reviewChatId]);
  const selectChat = useCallback(
    (id: string) => {
      if (requestedId !== id) {
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set('chat', id);
          return next;
        });
      }
      if (window.matchMedia('(max-width: 599px)').matches) setLibraryOpen(false);
    },
    [requestedId, setSearchParams]
  );
  useEffect(() => {
    if (settingsFocusRequest) settingsPanel.current?.querySelector('input')?.focus();
  }, [settingsFocusRequest]);
  useEffect(() => {
    if (searchFocusRequest) {
      searchInput.current?.focus();
      searchInput.current?.select();
    }
  }, [searchFocusRequest]);
  useEffect(() => {
    if (loaded && requestedId && chat?.id === requestedId) {
      void useComputerChatsStore
        .getState()
        .markOpened(requestedId)
        .catch(() => undefined);
    }
  }, [loaded, requestedId, chat?.id]);
  useEffect(() => {
    void initialize().catch((e: Error) => setError(e.message));
    void useDurableWorkflowsStore
      .getState()
      .initialize()
      .catch((e: Error) => setError(e.message));
  }, [initialize]);
  useEffect(() => {
    if (previousScope.current === scope) return;
    const clearSelection = previousScopeReady.current;
    previousScope.current = scope;
    previousScopeReady.current = Boolean(tenantId && brandId);
    if (clearSelection)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('chat');
          return next;
        },
        { replace: true }
      );
    setReport(null);
    setError('');
    setPrevious([]);
  }, [scope, tenantId, brandId, setSearchParams, setReport]);
  useEffect(() => {
    setConfiguration(configurations[`${tenantId}:${brandId}`] ?? DEFAULT_CHAT_CONFIGURATION);
  }, [tenantId, brandId, configurations]);

  const newChat = async (source?: {
    id: string;
    title: string;
    messages: { role: string; content: string }[];
  }) => {
    if (!tenantId || !brandId || creating) return;
    const auth = useAuthStore.getState();
    const connection = useDurableWorkflowsStore.getState();
    if (auth.tenant?.id !== tenantId || auth.currentBrand?.id !== brandId) return;
    if (
      !checkedSetup?.report.ready ||
      !sameSetupContext(checkedSetup.context, {
        tenantId,
        brandId,
        engineUrl: connection.engineUrl,
        apiKey: connection.apiKey,
        connectionRevision: connection.connectionRevision,
        configuring: connection.configuring,
        mcpServers: configuration.mcp_servers,
      })
    ) {
      setSettingsOpen(true);
      if (window.matchMedia('(max-width: 599px)').matches) setLibraryOpen(false);
      setError('Save the workflow connection and run its checks before creating a new computer.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const existing =
        source &&
        scoped.find(
          (c) =>
            c.legacySourceId === source.id &&
            !c.serverState?.cleanup_verified &&
            !terminalChat(c.serverState?.status ?? '')
        );
      if (existing) {
        selectChat(existing.id);
        return;
      }
      const id = await durableChatController.create(tenantId, brandId, configuration, source);
      selectChat(id);
      void durableChatController.provision(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };
  const loadPrevious = async () => {
    try {
      const value = await window.electronAPI?.store.get('chatPlaygroundConversations');
      if (Array.isArray(value))
        setPrevious(
          value.filter((c): c is ChatConversation =>
            Boolean(
              c &&
              typeof c === 'object' &&
              typeof c.id === 'string' &&
              typeof c.title === 'string' &&
              Array.isArray(c.messages)
            )
          )
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      className="computer-chat h-full"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'f' &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          openLibrary();
          setSearchFocusRequest((value) => value + 1);
          return;
        }
        if (event.key === 'Escape' && detailsOpen) {
          event.preventDefault();
          closeDetails();
        } else if (event.key === 'Escape' && settingsOpen) {
          event.preventDefault();
          setSettingsOpen(false);
          settingsToggle.current?.focus();
        } else if (
          event.key === 'Escape' &&
          libraryOpen &&
          window.matchMedia('(max-width: 599px)').matches
        ) {
          event.preventDefault();
          setLibraryOpen(false);
          libraryToggle.current?.focus();
        }
      }}
    >
      <div className="chat-shell">
        <header className="chat-page-header">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              ref={libraryToggle}
              className="minimal-icon-button"
              aria-label={libraryOpen ? 'Hide conversations' : 'Show conversations'}
              aria-expanded={libraryOpen}
              aria-controls="chat-library"
              onClick={() => (libraryOpen ? setLibraryOpen(false) : openLibrary())}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="chat-heading">Chats</h1>
              <p className="chat-caption hidden sm:block">A computer for every conversation.</p>
            </div>
          </div>
          <button
            type="button"
            ref={settingsToggle}
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-expanded={settingsOpen}
            aria-controls="chat-settings"
            className="minimal-secondary-button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Settings
          </button>
        </header>
        <div
          ref={settingsPanel}
          id="chat-settings"
          className="chat-settings"
          hidden={!settingsOpen}
        >
          {tenantId && brandId && (
            <DurableChatSetup
              key={`${tenantId}:${brandId}`}
              tenantId={tenantId}
              brandId={brandId}
              configuration={configuration}
              onChange={setConfiguration}
              report={report}
              onReport={setReport}
              onError={setError}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="chat-page-alert text-sm text-red-400">
            {error}
          </p>
        )}
        {persistenceError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-900/40 p-3 text-xs text-amber-300"
          >
            <p>
              Recent chat changes could not be saved to this device. Keep the app open and retry
              saving. Server workflows continue independently.
            </p>
            <p className="mt-1 break-words text-gray-500">{persistenceError}</p>
            <button
              type="button"
              onClick={() =>
                void useComputerChatsStore
                  .getState()
                  .flush()
                  .catch(() => undefined)
              }
              className="minimal-secondary-button mt-2"
            >
              Retry saving chats
            </button>
          </div>
        )}
        <div className={`chat-workspace ${libraryOpen ? 'chat-library-open' : ''}`}>
          <aside
            id="chat-library"
            hidden={!libraryOpen}
            aria-label="Computer conversations"
            className="chat-library"
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="chat-section-label">Conversations</span>
              <button
                type="button"
                aria-label="Close conversations"
                onClick={() => {
                  setLibraryOpen(false);
                  libraryToggle.current?.focus();
                }}
                className="minimal-icon-button chat-mobile-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void newChat()}
              disabled={!loaded || !tenantId || !brandId || creating}
              className="minimal-secondary-button w-full chat-new-button"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
            {!loaded && (
              <p role="status" className="mt-3 text-xs text-gray-500">
                Loading saved chats…
              </p>
            )}
            {loaded && !scoped.length && (
              <p className="mt-3 text-xs text-gray-500">
                Complete the connection checks, then create your first computer.
              </p>
            )}
            <ChatLibrary
              key={`${tenantId}:${brandId}`}
              activeId={activeId}
              onSelect={selectChat}
              onError={setError}
              searchRef={searchInput}
            />
            <details className="mt-6 pt-3 text-xs text-gray-500">
              <summary className="cursor-pointer">Previous playground history</summary>
              <p className="mt-2">
                Import a transcript into a new computer for the selected organization and brand.
                Original history is preserved.
              </p>
              <button
                type="button"
                onClick={() => void loadPrevious()}
                className="minimal-secondary-button mt-2"
              >
                Load previous conversations
              </button>
              <ul className="mt-2 space-y-2">
                {previous.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void newChat({
                          id: `playground:${conversation.id}`,
                          title: conversation.title,
                          messages: conversation.messages,
                        })
                      }
                      className="text-left hover:text-brand-300"
                    >
                      Import {conversation.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </aside>
          {!chat ? (
            <div className="chat-empty">
              <MessageSquare
                className="mb-6 h-7 w-7 text-gray-500"
                strokeWidth={1.4}
                aria-hidden="true"
              />
              <h2>
                {loaded && requestedId
                  ? 'Conversation unavailable'
                  : 'What would you like to work on?'}
              </h2>
              <p>
                {loaded && requestedId
                  ? 'This conversation is not available in the selected organization and brand.'
                  : 'Start a conversation. Your computer and progress stay with it.'}
              </p>
              {loaded && requestedId && (
                <button
                  type="button"
                  className="minimal-secondary-button mt-5"
                  onClick={() => {
                    setSearchParams(
                      (previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete('chat');
                        return next;
                      },
                      { replace: true }
                    );
                    openLibrary();
                  }}
                >
                  Back to conversations
                </button>
              )}
              <button
                type="button"
                className="minimal-primary-button mt-6"
                onClick={() => void newChat()}
                disabled={!loaded || !tenantId || !brandId || creating}
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
              <span className="mt-5 text-xs text-gray-500">
                Pick up any conversation from the sidebar.
              </span>
            </div>
          ) : !chat.durableSession ? (
            <LegacyConversation
              chat={chat}
              busy={working}
              onImport={() =>
                void newChat({
                  id: `computer:${chat.id}`,
                  title: chat.title,
                  messages: chat.messages,
                })
              }
            />
          ) : (
            <div className="chat-session">
              <div ref={conversation} data-chat-id={chat.id} className="chat-conversation">
                <div className="chat-conversation-header">
                  <div className="min-w-0 flex-1">
                    <h2
                      ref={conversationHeading}
                      tabIndex={-1}
                      className="truncate text-sm font-medium"
                    >
                      {chat.title}
                    </h2>
                    <p
                      aria-label="Conversation status"
                      className="chat-caption chat-status-label mt-1 flex items-center gap-1.5"
                      data-tone={status?.tone}
                    >
                      <span
                        aria-hidden="true"
                        className="chat-status-dot"
                        data-tone={status?.tone}
                      />
                      {state?.status === 'awaiting_approval' && state.pending_action ? (
                        <button
                          type="button"
                          aria-label="Review pending action"
                          aria-controls={`chat-approval-${chat.id}`}
                          onClick={focusReview}
                          className="rounded-sm underline-offset-2 hover:underline"
                        >
                          {status?.label}
                        </button>
                      ) : (
                        status?.label
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Refresh conversation"
                    onClick={() => void durableChatController.refresh(chat.id)}
                    className="minimal-icon-button"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  {state && !ended && !state.stop_requested && (
                    <>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void durableChatController.control(
                            chat.id,
                            state.paused ? 'resume' : 'pause'
                          )
                        }
                        aria-label={state.paused ? 'Resume work' : 'Pause work'}
                        title={state.paused ? 'Resume work' : 'Pause work'}
                        className="minimal-icon-button"
                      >
                        {state.paused ? (
                          <Play className="h-3 w-3" />
                        ) : (
                          <Pause className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void durableChatController.control(chat.id, 'stop')}
                        aria-label="Stop computer"
                        title="Stop computer"
                        className="minimal-icon-button"
                      >
                        <Square className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    id="chat-inspector-toggle"
                    ref={inspectorToggle}
                    type="button"
                    aria-label={detailsOpen ? 'Hide computer details' : 'Show computer details'}
                    aria-expanded={detailsOpen}
                    aria-controls="chat-inspector"
                    onClick={() => {
                      if (!detailsOpen && window.matchMedia('(max-width: 599px)').matches)
                        setLibraryOpen(false);
                      setDetailsOpen(!detailsOpen);
                    }}
                    className="minimal-secondary-button"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Computer</span>
                  </button>
                </div>
                <ConnectionNotice
                  key={`connection:${chat.id}`}
                  chat={chat}
                  onOpenSettings={() => {
                    setSettingsOpen(true);
                    setSettingsFocusRequest((value) => value + 1);
                  }}
                />
                {(chat.error || state?.error) && (
                  <div
                    role="alert"
                    className="m-3 rounded-lg border border-amber-900/50 bg-amber-950/15 p-3 text-xs text-amber-300"
                  >
                    {chat.error || state?.error}
                  </div>
                )}
                {!state && !working && !ended && (
                  <button
                    type="button"
                    onClick={() => void durableChatController.provision(chat.id)}
                    className="minimal-secondary-button m-3"
                  >
                    Connect computer workflow
                  </button>
                )}
                {state?.error && !ended && (
                  <div className="m-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void durableChatController.control(chat.id, 'retry')}
                      className="minimal-secondary-button"
                    >
                      Retry from recorded state
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void durableChatController.workspace(chat.id, 'recover')}
                      className="minimal-secondary-button"
                    >
                      Recover computer
                    </button>
                  </div>
                )}
                <ApprovalCard
                  key={`approval:${chat.id}`}
                  chat={chat}
                  busy={working}
                  onRestoreFocus={restoreReviewFocus}
                />
                <ConversationTranscript key={`transcript:${chat.id}`} chat={chat} />
                {chat.pendingMessage && (
                  <div className="border-t border-slate-700/40 px-4 py-2 text-xs text-gray-400">
                    <p>
                      {ended
                        ? 'Message not confirmed before this computer ended: '
                        : 'Waiting for the workflow to record: '}
                      {chat.pendingMessage.content.slice(0, 100)}
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer">View unconfirmed message</summary>
                      <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                        {chat.pendingMessage.content}
                      </p>
                    </details>
                    {ended && (
                      <p className="mt-2">
                        This computer ended before confirming this message. Its text remains saved
                        here.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={working || ended || Boolean(state?.stop_requested)}
                      onClick={() =>
                        void durableChatController.send(chat.id, chat.pendingMessage!.content)
                      }
                      className="minimal-secondary-button mt-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Resend safely
                    </button>
                  </div>
                )}
                <ChatInput
                  key={`input:${chat.id}`}
                  isLoading={working}
                  value={chat.draft ?? ''}
                  maxBytes={8000}
                  onChange={(draft) => useComputerChatsStore.getState().setDraft(chat.id, draft)}
                  onBlur={() =>
                    void useComputerChatsStore
                      .getState()
                      .flushDrafts()
                      .catch(() => undefined)
                  }
                  disabled={
                    !state ||
                    ended ||
                    Boolean(state?.stop_requested) ||
                    Boolean(chat.pendingMessage)
                  }
                  onSend={(content) => void durableChatController.send(chat.id, content)}
                  placeholder={
                    ended
                      ? 'Computer ended. Import this transcript to continue in a new computer.'
                      : state?.paused
                        ? 'Messages will wait until you resume work.'
                        : undefined
                  }
                />
                {ended && (
                  <button
                    type="button"
                    onClick={() =>
                      void newChat({
                        id: `computer:${chat.id}`,
                        title: chat.title,
                        messages: chat.messages,
                      })
                    }
                    className="minimal-secondary-button m-3"
                  >
                    Continue transcript in a new computer
                  </button>
                )}
              </div>
              <aside
                id="chat-inspector"
                hidden={!detailsOpen}
                aria-label="Computer workspace and evidence"
                className="chat-inspector"
              >
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-sm font-medium">Workspace</h2>
                  <button
                    type="button"
                    aria-label="Close computer details"
                    onClick={closeDetails}
                    className="minimal-icon-button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div role="tablist" aria-label="Computer details" className="chat-tabs">
                  {(['desktop', 'timeline', 'files'] as const).map((value) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === value}
                      aria-controls={`chat-panel-${value}`}
                      id={`chat-tab-${value}`}
                      tabIndex={tab === value ? 0 : -1}
                      key={value}
                      onClick={() => setTab(value)}
                      onKeyDown={(event) => {
                        const values = ['desktop', 'timeline', 'files'] as const;
                        const index = values.indexOf(value);
                        const next =
                          event.key === 'ArrowRight'
                            ? values[(index + 1) % 3]
                            : event.key === 'ArrowLeft'
                              ? values[(index + 2) % 3]
                              : event.key === 'Home'
                                ? values[0]
                                : event.key === 'End'
                                  ? values[2]
                                  : undefined;
                        if (next) {
                          event.preventDefault();
                          setTab(next);
                          document.getElementById(`chat-tab-${next}`)?.focus();
                        }
                      }}
                      className="chat-tab"
                    >
                      {value === 'desktop'
                        ? 'Computer'
                        : value === 'timeline'
                          ? 'Timeline'
                          : 'Files'}
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id={`chat-panel-${tab}`}
                  aria-labelledby={`chat-tab-${tab}`}
                  className="chat-inspector-content"
                  tabIndex={0}
                >
                  {tab === 'desktop' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm text-gray-300">Desktop</h2>
                        <button
                          type="button"
                          aria-label="Refresh desktop screenshot"
                          disabled={!state || working || ended}
                          onClick={() =>
                            void durableChatController.workspace(chat.id, 'screenshot')
                          }
                          className="minimal-icon-button"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      </div>
                      {state?.screenshot &&
                      /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(state.screenshot) ? (
                        <img
                          src={state.screenshot}
                          alt="Latest screenshot of this chat’s sandbox computer"
                          className="w-full rounded-lg border border-slate-700"
                        />
                      ) : (
                        <p className="chat-empty-preview rounded-lg p-6 text-center text-xs">
                          {ended
                            ? 'No screenshot was saved for this computer.'
                            : 'Capture a screenshot to view the computer.'}
                        </p>
                      )}
                      <details className="chat-session-details">
                        <summary>Session details</summary>
                        <p className="mt-3 break-all text-xs text-gray-500">
                          Session: {state?.session?.id ?? 'Preparing'}
                          <br />
                          Workflow: {chat.durableSession.workflowId}
                        </p>
                      </details>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!state || working || ended}
                          onClick={() =>
                            void durableChatController.workspace(chat.id, 'checkpoint')
                          }
                          className="minimal-secondary-button"
                        >
                          <Archive className="h-3 w-3" />
                          Save checkpoint
                        </button>
                        <button
                          type="button"
                          disabled={!state || working || ended}
                          onClick={() => void durableChatController.workspace(chat.id, 'recover')}
                          className="minimal-secondary-button"
                        >
                          Recover computer
                        </button>
                      </div>
                      {state?.checkpoint && (
                        <p className="break-all text-[10px] text-gray-500">
                          Latest checkpoint:{' '}
                          {String(state.checkpoint.id ?? state.checkpoint.checkpoint_id ?? 'saved')}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-500">
                        Pause stops new work after any in-flight action completes. Stop ends the
                        computer; completion is confirmed by the workflow.
                      </p>
                    </>
                  )}
                  {tab === 'timeline' && state && (
                    <ExecutionTimeline
                      state={{ ...state, events: chat.timeline ?? state.events }}
                      historyTruncated={chat.historyTruncated}
                    />
                  )}
                  {tab === 'files' && state && (
                    <>
                      <WorkspaceBrowser key={chat.id} chat={chat} busy={working} />
                      <Deliverables chat={chat} />
                    </>
                  )}
                </div>
                {state && (
                  <details className="chat-usage">
                    <summary>Usage and limits</summary>
                    <BudgetIndicator state={state} />
                  </details>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegacyConversation({
  chat,
  busy,
  onImport,
}: {
  chat: ComputerChat;
  busy: boolean;
  onImport: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="m-3 rounded-lg border border-slate-700 p-3 text-xs text-gray-400">
        <p>
          This conversation uses the earlier desktop-owned runtime. Its transcript and original
          computer identity are preserved.
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onImport} className="minimal-primary-button">
            Import transcript into a durable computer
          </button>
          {!chat.stopped && chat.session && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void computerChatRuntime.stop(chat.id)}
              className="minimal-secondary-button"
            >
              Stop previous computer
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {chat.messages.map((message) =>
          message.role === 'tool' ? (
            <ToolActivityBubble key={message.id} message={message} />
          ) : (
            <ChatMessageBubble key={message.id} message={message} />
          )
        )}
      </div>
    </div>
  );
}
