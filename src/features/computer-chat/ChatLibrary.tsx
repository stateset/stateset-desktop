import { memo, useState, type RefObject } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, Search, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useComputerChatsStore } from './store';
import { selectChats, type ChatFilter } from './library';
import { conversationStatus } from './presentation';
import type { ComputerChat } from './types';

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onError: (message: string) => void;
  searchRef?: RefObject<HTMLInputElement>;
}
export function ChatLibrary({ activeId, onSelect, onError, searchRef }: Props) {
  const tenantId = useAuthStore((s) => s.tenant?.id);
  const brandId = useAuthStore((s) => s.currentBrand?.id);
  const chats = useComputerChatsStore((s) => s.chats);
  const connections = useComputerChatsStore((s) => s.connections);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const visible = selectChats(chats, tenantId, brandId, query, filter, connections);
  const attentionCount = selectChats(chats, tenantId, brandId, '', 'attention', connections).length;
  return (
    <div className="chat-library-list mt-5 space-y-4">
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-500" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search conversations"
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
          className="minimal-input w-full pl-7 text-xs"
        />
      </label>
      <select
        aria-label="Filter conversations"
        value={filter}
        onChange={(e) => setFilter(e.target.value as ChatFilter)}
        className="chat-filter minimal-input w-full text-xs"
      >
        <option value="all">All chats</option>
        <option value="active">Active computers</option>
        <option value="attention">
          Needs attention{attentionCount ? ` (${attentionCount})` : ''}
        </option>
        <option value="ended">Ended computers</option>
        <option value="archived">Archived chats</option>
      </select>
      <p className="text-[10px] text-gray-500">
        {visible.length} {visible.length === 1 ? 'conversation' : 'conversations'}
      </p>
      {!visible.length && (
        <p className="text-xs text-gray-500">
          {query ? 'No conversations match your search.' : 'No conversations in this view.'}
        </p>
      )}
      <ul className="space-y-1" aria-label="Saved conversations">
        {visible.map((chat) => (
          <ChatLibraryRow
            key={chat.id}
            chat={chat}
            selected={chat.id === activeId}
            onSelect={onSelect}
            onError={onError}
          />
        ))}
      </ul>
      {filter === 'archived' && (
        <p className="text-[10px] text-gray-500">
          Archiving hides a chat from the main list. Its computer continues until you stop it.
        </p>
      )}
    </div>
  );
}
const ChatLibraryRow = memo(function ChatLibraryRow({
  chat,
  selected,
  onSelect,
  onError,
}: { chat: ComputerChat; selected: boolean } & Omit<Props, 'activeId'>) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(chat.title);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useComputerChatsStore((s) => s.busy[chat.id]);
  const connection = useComputerChatsStore((s) => s.connections[chat.id]?.status);
  const status = conversationStatus(chat, connection ? { status: connection } : undefined);
  const update = async (metadata: { title?: string; pinned?: boolean; archived?: boolean }) => {
    setSaving(true);
    try {
      await useComputerChatsStore.getState().updateMetadata(chat.id, metadata);
      setRenaming(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await useComputerChatsStore.getState().remove(chat.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const removable = Boolean(chat.stopped || chat.serverState?.cleanup_verified);
  return (
    <li className={`chat-library-row ${selected ? 'is-selected' : ''}`}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => onSelect(chat.id)}
          aria-current={selected ? 'true' : undefined}
          className="min-w-0 flex-1 p-2 text-left"
        >
          <span className="flex items-center gap-1 text-[13px] font-medium">
            {chat.pinned && <Pin aria-label="Pinned" className="h-3 w-3 shrink-0" />}
            <span className="truncate">{chat.title}</span>
          </span>
          <span className="chat-status-label mt-1 block text-[10px]" data-tone={status.tone}>
            {status.label}
          </span>
          {chat.draft?.trim() && (
            <span className="mt-1 block text-[10px] text-brand-300">Unsent draft</span>
          )}
        </button>
        <details className="relative mr-1 mt-1">
          <summary
            aria-label={`Options for ${chat.title}`}
            className="minimal-icon-button list-none cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-44 space-y-1 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs shadow-xl">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setName(chat.title);
                setRenaming(true);
              }}
              className="minimal-secondary-button w-full"
            >
              <Pencil className="h-3 w-3" />
              Rename
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void update({ pinned: !chat.pinned })}
              className="minimal-secondary-button w-full"
            >
              <Pin className="h-3 w-3" />
              {chat.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void update({ archived: !chat.archived })}
              className="minimal-secondary-button w-full"
            >
              {chat.archived ? (
                <ArchiveRestore className="h-3 w-3" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
              {chat.archived ? 'Restore chat' : 'Archive chat'}
            </button>
            <p className="px-1 py-1 text-[10px] text-gray-500">
              Archive keeps the computer running.
            </p>
            {removable && (
              <button
                type="button"
                disabled={saving || busy}
                onClick={() => setDeleting(true)}
                className="minimal-secondary-button w-full text-red-300"
              >
                <Trash2 className="h-3 w-3" />
                Delete saved chat
              </button>
            )}
          </div>
        </details>
      </div>
      {renaming && (
        <form
          className="space-y-2 p-2"
          aria-label={`Rename ${chat.title}`}
          onSubmit={(e) => {
            e.preventDefault();
            void update({ title: name });
          }}
        >
          <input
            aria-label="Conversation name"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="minimal-input w-full text-xs"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="minimal-primary-button text-xs"
            >
              Save name
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setRenaming(false)}
              className="minimal-secondary-button text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div className="space-y-2 p-2 text-xs" role="group" aria-label="Confirm chat deletion">
          <p className="text-gray-400">
            Delete this saved transcript and its local evidence cache?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || busy || !removable}
              onClick={() => void remove()}
              className="minimal-secondary-button text-red-300"
            >
              Delete permanently
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setDeleting(false)}
              className="minimal-secondary-button"
            >
              Keep chat
            </button>
          </div>
        </div>
      )}
    </li>
  );
});
