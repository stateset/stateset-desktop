import { useEffect, useRef, useState, useCallback } from 'react';
import { Bot, Save, Sparkles } from 'lucide-react';
import { useToast } from '../../../components/ToastProvider';
import { useAuthStore } from '../../../stores/auth';
import { useChatPlayground } from '../hooks/useChatPlayground';
import { useChatHistory } from '../hooks/useChatHistory';
import { useAgentStream } from '../../../hooks/useAgentStream';
import { ConversationList } from './ConversationList';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInput } from './ChatInput';
import { QuickConfigBar } from './QuickConfigBar';
import { EmptyState } from '../../../components/EmptyState';
import type { ChatConversation, ChatMessage } from '../../../types';

const SUGGESTED_PROMPTS = [
  'Summarize the latest customer support tickets and highlight any recurring issues.',
  'Draft a response to a customer asking about our return policy.',
  'Analyze our top-selling products from last quarter and suggest marketing angles.',
  'Help me write a workflow for handling order fulfillment exceptions.',
];

function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="message-assistant rounded-2xl px-4 py-3 border">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function ChatPlayground() {
  const { showToast } = useToast();
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [temperature, setTemperature] = useState(0.7);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedStreamIdsRef = useRef<Set<string>>(new Set());

  const { conversations, isLoaded, addConversation, updateConversation, deleteConversation } =
    useChatHistory();

  const {
    messages,
    isLoading,
    setIsLoading,
    activeSessionId,
    sendMessage,
    appendMessage,
    loadConversation,
    startNewChat,
    currentConversation,
  } = useChatPlayground({
    onError: (msg) => showToast({ variant: 'error', title: 'Chat error', message: msg }),
    model,
    temperature,
  });

  const tenantId = tenant?.id ?? '';
  const brandId = currentBrand?.id ?? '';

  const stream = useAgentStream({
    tenantId,
    brandId,
    sessionId: activeSessionId ?? '',
    autoReconnect: true,
  });

  // Connect to stream when session becomes available
  useEffect(() => {
    if (activeSessionId && tenantId && brandId) {
      processedStreamIdsRef.current.clear();
      stream.connect();
    }
    return () => {
      if (activeSessionId) {
        stream.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, tenantId, brandId]);

  // Process incoming stream messages
  useEffect(() => {
    for (const event of stream.messages) {
      if (processedStreamIdsRef.current.has(event._id)) continue;
      processedStreamIdsRef.current.add(event._id);

      if (event.type === 'message' && event.role === 'assistant') {
        const chatMsg: ChatMessage = {
          id: event._id,
          role: 'assistant',
          content: event.content,
          timestamp: event._timestamp,
        };
        appendMessage(chatMsg);
        setIsLoading(false);
      }
    }
  }, [stream.messages, appendMessage, setIsLoading]);

  // Auto-scroll on new messages or typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stream.isTyping]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  const handleSelectConversation = useCallback(
    (convo: ChatConversation) => {
      setActiveConvoId(convo.id);
      loadConversation(convo);
    },
    [loadConversation]
  );

  const handleNewChat = useCallback(() => {
    // Save current conversation if it has messages
    if (messages.length > 0 && !activeConvoId) {
      const convo: ChatConversation = {
        id: `chat-${Date.now()}`,
        title: currentConversation.title,
        agentType: currentConversation.agentType,
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addConversation(convo);
    } else if (messages.length > 0 && activeConvoId) {
      updateConversation(activeConvoId, { messages });
    }

    stream.disconnect();
    stream.clearEvents();
    processedStreamIdsRef.current.clear();
    setActiveConvoId(null);
    startNewChat();
  }, [
    messages,
    activeConvoId,
    currentConversation,
    addConversation,
    updateConversation,
    startNewChat,
    stream,
  ]);

  const handleSaveConversation = useCallback(() => {
    if (messages.length === 0) return;

    if (activeConvoId) {
      updateConversation(activeConvoId, { messages, title: currentConversation.title });
      showToast({ variant: 'success', title: 'Saved', message: 'Conversation updated.' });
    } else {
      const convo: ChatConversation = {
        id: `chat-${Date.now()}`,
        title: currentConversation.title,
        agentType: currentConversation.agentType,
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addConversation(convo);
      setActiveConvoId(convo.id);
      showToast({ variant: 'success', title: 'Saved', message: 'Conversation saved.' });
    }
  }, [
    messages,
    activeConvoId,
    currentConversation,
    addConversation,
    updateConversation,
    showToast,
  ]);

  if (!isLoaded) return null;

  return (
    <div className="page-shell h-full">
      <div className="content-card h-full p-4 flex flex-col gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gray-500">Agent Tools</p>
          <h1 className="page-title">Chat Playground</h1>
          <p className="page-subtitle">
            Run quick experiments with AI conversations, then save and revisit chats anytime.
          </p>
        </div>

        <div className="flex-1 flex overflow-hidden rounded-xl border border-slate-700/45 bg-slate-900/20">
          <ConversationList
            conversations={conversations}
            activeId={activeConvoId || undefined}
            onSelect={handleSelectConversation}
            onDelete={deleteConversation}
            onNewChat={handleNewChat}
          />

          <div className="flex-1 flex flex-col min-w-0">
            {/* Config bar */}
            <QuickConfigBar
              model={model}
              temperature={temperature}
              onModelChange={setModel}
              onTemperatureChange={setTemperature}
            />

            {/* Save button in header */}
            <div className="px-4 py-2.5 border-b border-slate-700/45 flex items-center justify-between bg-slate-900/20">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-gray-300">
                  {activeConvoId
                    ? conversations.find((c) => c.id === activeConvoId)?.title || 'Chat'
                    : messages.length > 0
                      ? 'Unsaved Chat'
                      : 'New Chat'}
                </h2>
                {stream.isConnected && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              {messages.length > 0 && (
                <button
                  onClick={handleSaveConversation}
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                  aria-label="Save conversation"
                >
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  Save
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <EmptyState
                    icon={Bot}
                    title="Chat Playground"
                    description="Send a message to start chatting with an AI agent."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="group flex items-start gap-2 px-3 py-2.5 text-left text-xs text-gray-400 hover:text-gray-200 bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/40 hover:border-slate-600/60 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      >
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                        <span className="line-clamp-2">{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <ChatMessageBubble key={msg.id} message={msg} />
                  ))}
                  {(isLoading || stream.isTyping) && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
