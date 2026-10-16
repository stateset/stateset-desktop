import { memo, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, Search, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { usePopupNavigation } from '../../hooks/usePopupNavigation';
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
  const localSearchRef = useRef<HTMLInputElement>(null);
  const librarySearchRef = searchRef ?? localSearchRef;
  const visible = selectChats(chats, tenantId, brandId, query, filter, connections);
  const attentionCount = selectChats(chats, tenantId, brandId, '', 'attention', connections).length;
  return (
    <div className="chat-library-list mt-5 space-y-4">
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-500" />
        <input
          ref={librarySearchRef}
          type="search"
          aria-label="Search conversations"
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
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
            searchRef={librarySearchRef}
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
  searchRef,
}: { chat: ComputerChat; selected: boolean } & Omit<Props, 'activeId'>) {
  const [editor, setEditor] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState(chat.title);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const menu = usePopupNavigation('menu');
  const triggerRef = menu.triggerProps.ref;
  const popupRef = menu.popupProps.ref;
  const archiveHintId = useId();
  const busy = useComputerChatsStore((s) => s.busy[chat.id]);
  const connection = useComputerChatsStore((s) => s.connections[chat.id]?.status);
  const status = conversationStatus(chat, connection ? { status: connection } : undefined);
  useLayoutEffect(() => {
    if (!menu.isOpen) return;
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    const sidebar = trigger?.closest('.chat-library');
    if (!trigger || !popup || !sidebar) return;
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      const bounds = sidebar.getBoundingClientRect();
      const above = Math.max(0, anchor.top - Math.max(0, bounds.top) - 8);
      const below = Math.max(0, Math.min(window.innerHeight, bounds.bottom) - anchor.bottom - 8);
      const openAbove = popup.scrollHeight > below && above > below;
      popup.style.top = openAbove ? 'auto' : 'calc(100% + 4px)';
      popup.style.bottom = openAbove ? 'calc(100% + 4px)' : 'auto';
      popup.style.maxHeight = `${openAbove ? above : below}px`;
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [menu.isOpen, triggerRef, popupRef]);
  useLayoutEffect(() => {
    if (editor === 'rename') {
      nameRef.current?.focus();
      nameRef.current?.select();
    } else if (editor === 'delete') keepRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editor, triggerRef]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const search = searchRef?.current;
    return () => {
      // Filtering, archiving and deletion may remove a focused row. Do not
      // strand focus on the document or steal it from another control.
      if (row?.contains(document.activeElement)) search?.focus();
    };
  }, [searchRef]);
  const closeEditor = () => {
    restoreFocus.current = Boolean(rowRef.current?.contains(document.activeElement));
    setEditor(null);
  };
  const update = async (metadata: { title?: string; pinned?: boolean; archived?: boolean }) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await useComputerChatsStore.getState().updateMetadata(chat.id, metadata);
      closeEditor();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const remove = async () => {
    if (pending.current) return;
    const current = useComputerChatsStore.getState();
    const latest = current.chats.find((value) => value.id === chat.id);
    if (
      !latest ||
      current.busy[chat.id] ||
      !(latest.stopped || latest.serverState?.cleanup_verified)
    )
      return;
    pending.current = true;
    setSaving(true);
    try {
      await useComputerChatsStore.getState().remove(chat.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const removable = Boolean(chat.stopped || chat.serverState?.cleanup_verified);
  return (
    <li ref={rowRef} className={`chat-library-row ${selected ? 'is-selected' : ''}`}>
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
        <div {...menu.containerProps} className="relative mr-1 mt-1">
          <button
            {...menu.triggerProps}
            type="button"
            aria-label={`Options for ${chat.title}`}
            aria-disabled={saving || editor !== null}
            onClick={() => {
              if (!pending.current && !editor) menu.triggerProps.onClick();
            }}
            onKeyDown={(event) => {
              if (!pending.current && !editor) menu.triggerProps.onKeyDown(event);
            }}
            className="chat-library-menu-trigger minimal-icon-button"
          >
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          </button>
          {menu.isOpen && (
            <div
              {...menu.popupProps}
              aria-label={`Actions for ${chat.title}`}
              className="chat-library-menu ui-popup absolute right-0 z-30 w-48 overflow-y-auto rounded-lg p-1 text-xs"
            >
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                disabled={saving}
                onClick={() => {
                  setName(chat.title);
                  menu.close();
                  setEditor('rename');
                }}
                className="ui-popup-item flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                disabled={saving}
                onClick={() => {
                  menu.close(true);
                  void update({ pinned: !chat.pinned });
                }}
                className="ui-popup-item flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
              >
                <Pin aria-hidden="true" className="h-3.5 w-3.5" />
                {chat.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                disabled={saving}
                aria-describedby={archiveHintId}
                onClick={() => {
                  menu.close(true);
                  void update({ archived: !chat.archived });
                }}
                className="ui-popup-item flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
              >
                {chat.archived ? (
                  <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {chat.archived ? 'Restore chat' : 'Archive chat'}
              </button>
              <p id={archiveHintId} role="none" className="ui-popup-label px-3 py-2 text-[10px]">
                Archive keeps the computer running.
              </p>
              {removable && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                  disabled={saving || busy}
                  onClick={() => {
                    menu.close();
                    setEditor('delete');
                  }}
                  className="ui-popup-item chat-danger flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Delete saved chat
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {editor === 'rename' && (
        <form
          className="space-y-2 p-2"
          aria-label={`Rename ${chat.title}`}
          aria-busy={saving}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (!pending.current) closeEditor();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            if (rowRef.current?.contains(document.activeElement)) nameRef.current?.focus();
            void update({ title: name });
          }}
        >
          <input
            ref={nameRef}
            aria-label="Conversation name"
            readOnly={saving}
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
              onClick={closeEditor}
              className="minimal-secondary-button text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {editor === 'delete' && (
        <div
          className="space-y-2 p-2 text-xs"
          role="group"
          aria-label="Confirm chat deletion"
          aria-busy={saving}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (!pending.current) closeEditor();
          }}
        >
          <p className="text-gray-400">
            Delete this saved transcript and its local evidence cache?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={saving || busy || !removable}
              onClick={() => void remove()}
              className="minimal-secondary-button chat-danger"
            >
              Delete permanently
            </button>
            <button
              ref={keepRef}
              type="button"
              disabled={saving}
              onClick={closeEditor}
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
