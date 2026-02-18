import { useEffect, useRef, useState, useCallback } from 'react';
import { Bot, Save } from 'lucide-react';
import { useToast } from '../../../components/ToastProvider';
import { useChatPlayground } from '../hooks/useChatPlayground';
import { useChatHistory } from '../hooks/useChatHistory';
import { ConversationList } from './ConversationList';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInput } from './ChatInput';
import { QuickConfigBar } from './QuickConfigBar';
import { EmptyState } from '../../../components/EmptyState';
import type { ChatConversation } from '../../../types';

export function ChatPlayground() {
  const { showToast } = useToast();
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [temperature, setTemperature] = useState(0.7);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { conversations, isLoaded, addConversation, updateConversation, deleteConversation } =
    useChatHistory();

  const { messages, isLoading, sendMessage, loadConversation, startNewChat, currentConversation } =
    useChatPlayground({
      onError: (msg) => showToast({ variant: 'error', title: 'Chat error', message: msg }),
    });

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    setActiveConvoId(null);
    startNewChat();
  }, [
    messages,
    activeConvoId,
    currentConversation,
    addConversation,
    updateConversation,
    startNewChat,
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
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        activeId={activeConvoId || undefined}
        onSelect={handleSelectConversation}
        onDelete={deleteConversation}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 flex flex-col">
        {/* Config bar */}
        <QuickConfigBar
          model={model}
          temperature={temperature}
          onModelChange={setModel}
          onTemperatureChange={setTemperature}
        />

        {/* Save button in header */}
        <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">
            {activeConvoId
              ? conversations.find((c) => c.id === activeConvoId)?.title || 'Chat'
              : messages.length > 0
                ? 'Unsaved Chat'
                : 'New Chat'}
          </h2>
          {messages.length > 0 && (
            <button
              onClick={handleSaveConversation}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="Chat Playground"
              description="Send a message to start chatting with an AI agent. Messages are sent to a new agent session."
            />
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
