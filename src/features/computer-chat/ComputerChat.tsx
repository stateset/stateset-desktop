import { useEffect, useRef, useState } from 'react';
import { Monitor, Plus, Camera, Pause, Square, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { ChatInput } from '../chat-playground/components/ChatInput';
import { ChatMessageBubble } from '../chat-playground/components/ChatMessageBubble';
import { ToolActivityBubble } from '../chat-playground/components/ToolActivityBubble';
import { ComputerChatSettings } from './ComputerChatSettings';
import { useComputerChatsStore } from './store';
import { computerChatRuntime } from './runtime';

export function ComputerChat() {
  const tenantId = useAuthStore((s) => s.tenant?.id);
  const brandId = useAuthStore((s) => s.currentBrand?.id);
  const { chats, loaded, busy, initialize, remove } = useComputerChatsStore();
  const [activeId, setActiveId] = useState<string>();
  const [error, setError] = useState('');
  const [durable, setDurable] = useState(true);
  const [verify, setVerify] = useState(true);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [creating, setCreating] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const scoped = chats.filter((chat) => chat.tenantId === tenantId && chat.brandId === brandId);
  const chat = scoped.find((item) => item.id === activeId);
  const working = Boolean(chat && busy[chat.id]);
  const options = { durable, verify, model };

  useEffect(() => {
    void initialize().catch((e: Error) => setError(e.message));
    void useDurableWorkflowsStore.getState().initialize();
  }, [initialize]);
  useEffect(() => {
    setActiveId(undefined);
    setError('');
  }, [tenantId, brandId]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [chat?.messages.length]);

  const newChat = async () => {
    if (!tenantId || !brandId || creating) return;
    setCreating(true);
    setError('');
    try {
      const id = await computerChatRuntime.create(tenantId, brandId);
      setActiveId(id);
      void computerChatRuntime.provision(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-shell h-full">
      <div className="content-card h-full p-4 flex flex-col gap-4">
        <div>
          <h1 className="page-title">Computer chats</h1>
          <p className="page-subtitle">
            Each chat has its own sandbox computer, saved conversation, and execution history.
          </p>
        </div>
        {tenantId && brandId && (
          <ComputerChatSettings
            key={`${tenantId}-${brandId}`}
            tenantId={tenantId}
            brandId={brandId}
            onError={setError}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={durable}
              onChange={(e) => setDurable(e.target.checked)}
            />
            Run actions in durable workflows
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
            Evaluate actions and outputs with NSR
          </label>
          <label className="flex items-center gap-2">
            Model
            <input
              aria-label="Computer chat model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="minimal-input text-xs"
            />
          </label>
        </div>
        <div className="flex flex-1 min-h-0 rounded-xl border border-slate-700/45 overflow-hidden">
          <aside
            aria-label="Computer conversations"
            className="w-56 shrink-0 border-r border-slate-700/45 p-3 overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => void newChat()}
              disabled={!loaded || !tenantId || !brandId || creating}
              className="minimal-primary-button w-full"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
            {!loaded && (
              <p role="status" className="mt-4 text-xs text-gray-500">
                Loading chats…
              </p>
            )}
            {loaded && !scoped.length && (
              <p className="mt-4 text-xs text-gray-500">
                Create a chat to start a new computer session.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {scoped.map((item) => (
                <div key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    aria-current={chat?.id === item.id ? 'true' : undefined}
                    className={`flex-1 min-w-0 text-left rounded-lg p-2 text-sm ${chat?.id === item.id ? 'bg-brand-600/20 text-brand-300' : 'text-gray-400 hover:bg-slate-800'}`}
                  >
                    <span className="block truncate">{item.title}</span>
                    <span className="text-[10px] text-gray-500">
                      {busy[item.id]
                        ? 'Working'
                        : item.stopped
                          ? 'Stopped'
                          : (item.session?.status ?? 'Not started')}
                      {item.pending ? ' · action pending' : ''}
                    </span>
                  </button>
                  {item.stopped && !busy[item.id] && (
                    <button
                      type="button"
                      aria-label={`Delete ${item.title}`}
                      onClick={() => {
                        void remove(item.id).catch((e: Error) => setError(e.message));
                      }}
                      className="minimal-icon-button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
          {!chat ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Monitor className="h-9 w-9" />
              <p>Start a new chat or open a saved computer.</p>
            </div>
          ) : (
            <div className="flex flex-1 min-w-0 flex-col xl:flex-row">
              <div className="flex flex-1 min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-700/45 text-xs text-gray-400">
                  <span className="flex-1 truncate" title={chat.session?.id}>
                    Computer: {chat.stopped ? 'stopped' : (chat.session?.status ?? 'not started')}
                  </span>
                  {working ? (
                    <button
                      type="button"
                      onClick={() => computerChatRuntime.pause(chat.id)}
                      className="minimal-secondary-button"
                    >
                      <Pause className="h-3 w-3" />
                      Pause conversation
                    </button>
                  ) : (
                    <>
                      {!chat.stopped && (
                        <button
                          type="button"
                          onClick={() => void computerChatRuntime.stop(chat.id)}
                          className="minimal-secondary-button"
                        >
                          <Square className="h-3 w-3" />
                          Stop computer
                        </button>
                      )}
                    </>
                  )}
                </div>
                {chat.error && (
                  <div role="alert" className="m-3 text-xs text-red-400">
                    {chat.error}
                  </div>
                )}
                {!working && !chat.stopped && !chat.session && (
                  <button
                    type="button"
                    onClick={() => void computerChatRuntime.provision(chat.id)}
                    className="minimal-secondary-button m-3"
                  >
                    Retry computer setup
                  </button>
                )}
                {chat.pending && !working && !chat.stopped && (
                  <button
                    type="button"
                    onClick={() => void computerChatRuntime.resume(chat.id)}
                    className="minimal-secondary-button m-3"
                  >
                    Resume action
                  </button>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-label="Chat transcript">
                  {!chat.messages.length && (
                    <p className="text-sm text-gray-500">
                      Ask the agent to use its computer. For example: “Open the browser and research
                      this topic, then save your findings in /workspace.”
                    </p>
                  )}
                  {chat.messages.map((item) =>
                    item.role === 'tool' ? (
                      <ToolActivityBubble key={item.id} message={item} />
                    ) : (
                      <ChatMessageBubble key={item.id} message={item} />
                    )
                  )}
                  {working && (
                    <p role="status" className="text-xs text-brand-400">
                      Working on this computer…
                    </p>
                  )}
                  <div ref={end} />
                </div>
                <ChatInput
                  key={chat.id}
                  isLoading={working}
                  disabled={Boolean(chat.pending) || Boolean(chat.stopped)}
                  placeholder={
                    chat.stopped
                      ? 'Computer stopped. Create a new chat to continue.'
                      : chat.pending
                        ? 'Resume the pending action to continue.'
                        : undefined
                  }
                  onSend={(text) => void computerChatRuntime.send(chat.id, text, options)}
                />
              </div>
              <aside
                aria-label="Computer preview and verification"
                className="xl:w-80 shrink-0 border-t xl:border-t-0 xl:border-l border-slate-700/45 p-3 space-y-3 overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm text-gray-300">Desktop</h2>
                  <button
                    type="button"
                    aria-label="Refresh desktop screenshot"
                    disabled={working || Boolean(chat.pending) || Boolean(chat.stopped)}
                    onClick={() => void computerChatRuntime.screenshot(chat.id, options)}
                    className="minimal-icon-button"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                {chat.screenshot ? (
                  <img
                    src={chat.screenshot}
                    alt="Latest screenshot of this chat’s sandbox desktop"
                    className="w-full rounded-lg border border-slate-700"
                  />
                ) : (
                  <div className="rounded-lg bg-slate-950/60 p-6 text-center text-xs text-gray-500">
                    Capture a screenshot to view the desktop.
                  </div>
                )}
                <p className="break-all text-[10px] text-gray-500">
                  Session: {chat.session?.id ?? 'Not allocated'}
                  <br />
                  Sandbox: {chat.session?.currentSandboxId ?? 'Not allocated'}
                </p>
                <h2 className="text-sm text-gray-300">Workflow executions</h2>
                {!chat.workflows.length && (
                  <p className="text-xs text-gray-500">No durable actions submitted.</p>
                )}
                {chat.workflows.map((run) => (
                  <p
                    key={run.workflowId}
                    title={`Run: ${run.runId}`}
                    className="break-all font-mono text-[10px] text-gray-400"
                  >
                    {run.workflowId}
                  </p>
                ))}
                <h2 className="text-sm text-gray-300">Policy evaluation</h2>
                {chat.policy ? (
                  <div className="text-xs text-gray-400">
                    <p>
                      Latest {chat.policy.phase}: <strong>{chat.policy.verdict}</strong>
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px]">
                      Action hash: {chat.policy.actionHash}
                    </p>
                    {chat.policy.reasons.map((reason, i) => (
                      <p key={i} className="mt-1">
                        {reason}
                      </p>
                    ))}
                    <p className="mt-1 break-all text-[10px]">
                      Evidence: {chat.policy.evidenceIds.join(', ') || 'None returned'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No policy receipt yet.</p>
                )}
                {Boolean(chat.policyHistory?.length) && (
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer">
                      Policy history ({chat.policyHistory!.length})
                    </summary>
                    <div className="mt-2 space-y-3">
                      {chat.policyHistory!.map((receipt, index) => (
                        <div
                          key={`${receipt.requestId}-${index}`}
                          className="break-all text-[10px]"
                        >
                          <p>
                            {receipt.phase}: {receipt.verdict} ·{' '}
                            {new Date(receipt.checkedAt).toLocaleTimeString()}
                          </p>
                          <p>Action: {receipt.requestId}</p>
                          <p>Evidence: {receipt.evidenceIds.join(', ') || 'None returned'}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <p className="text-[10px] text-gray-500">
                  NSR evaluates action policy, exit status, and truncation. Factual correctness of
                  an answer is outside this check.
                </p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
