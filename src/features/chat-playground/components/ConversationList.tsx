import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ChatConversation } from '../../../types';

interface ConversationListProps {
  conversations: ChatConversation[];
  activeId?: string;
  onSelect: (conversation: ChatConversation) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: ConversationListProps) {
  return (
    <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900/50">
      <div className="p-3 border-b border-gray-800">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Start new chat"
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-medium border border-brand-600/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-8">No conversations yet</div>
        ) : (
          conversations.map((convo) => (
            <div
              key={convo.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(convo)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(convo);
                }
              }}
              className={clsx(
                'group w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                activeId === convo.id
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              )}
              aria-label={`Open ${convo.title}`}
              aria-current={activeId === convo.id ? 'true' : undefined}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{convo.title}</p>
                <p className="text-[10px] text-gray-500">
                  {convo.messages.length} msg{convo.messages.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete conversation ${convo.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(convo.id);
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-900/50 hover:text-red-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
