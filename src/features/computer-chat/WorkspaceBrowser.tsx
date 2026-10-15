import { useState } from 'react';
import { ArrowUp, File, Folder } from 'lucide-react';
import { durableChatController } from './durable';
import { workspaceDirectory } from './artifacts';
import { chatEnded } from './library';
import type { ComputerChat } from './types';

export function WorkspaceBrowser({ chat, busy }: { chat: ComputerChat; busy: boolean }) {
  const workspace = chat.serverState?.workspace;
  const observed = workspace?.path ?? '/workspace';
  const [path, setPath] = useState(observed);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string>();
  const disabled = busy || chatEnded(chat);
  const navigate = async (value: string, operation: 'list' | 'read' = 'list') => {
    if (disabled) return;
    try {
      const target = workspaceDirectory(value);
      setError(undefined);
      if (operation === 'list') {
        setPath(target);
        setFilter('');
      }
      await durableChatController.workspace(chat.id, operation, target);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const parts =
    observed === '/workspace' || observed.startsWith('/workspace/')
      ? observed.split('/').filter(Boolean)
      : ['workspace'];
  const entries =
    workspace?.entries
      .filter((entry) => entry.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
      .sort(
        (a, b) =>
          Number(b.type === 'directory') - Number(a.type === 'directory') ||
          a.name.localeCompare(b.name)
      ) ?? [];
  return (
    <section aria-label="Workspace browser" className="space-y-3">
      <h2 className="text-sm font-medium">Workspace</h2>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(path.trim());
        }}
      >
        <input
          aria-label="Workspace directory"
          aria-invalid={Boolean(error) || undefined}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setError(undefined);
          }}
          className="minimal-input min-w-0 flex-1 text-xs"
        />
        <button type="submit" disabled={disabled} className="minimal-secondary-button">
          {busy ? 'Loading…' : 'Browse'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {workspace && (
        <>
          <nav
            aria-label="Workspace folders"
            className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500"
          >
            <button
              type="button"
              aria-label="Parent directory"
              disabled={disabled || observed === '/workspace'}
              onClick={() =>
                void navigate(parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/workspace')
              }
              className="minimal-icon-button"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            {parts.map((part, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <span aria-hidden="true">/</span>}
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={index === parts.length - 1 ? 'location' : undefined}
                  onClick={() => void navigate('/' + parts.slice(0, index + 1).join('/'))}
                  className="break-all rounded px-1 py-1 text-left hover:underline"
                >
                  {part}
                </button>
              </span>
            ))}
          </nav>
          {workspace.entries.length > 5 && (
            <input
              type="search"
              aria-label="Filter workspace files"
              placeholder="Find a file…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="minimal-input w-full text-xs"
            />
          )}
        </>
      )}
      <ul className="chat-workspace-files" aria-label="Workspace files">
        {entries.map((entry) => (
          <li key={entry.path} className="flex items-center gap-2 py-2 text-xs">
            <button
              type="button"
              disabled={disabled || entry.type === 'unsupported'}
              onClick={() =>
                void navigate(entry.path, entry.type === 'directory' ? 'list' : 'read')
              }
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-gray-400"
              title={
                entry.type === 'directory'
                  ? `Open ${entry.name}`
                  : `Collect ${entry.name} as a deliverable`
              }
            >
              {entry.type === 'directory' ? (
                <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <File className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            <span className="shrink-0 text-[10px] text-gray-500">
              {entry.type === 'file'
                ? `${entry.size_bytes.toLocaleString()} B`
                : entry.type === 'directory'
                  ? 'Folder'
                  : 'Unavailable'}
            </span>
          </li>
        ))}
      </ul>
      {!workspace ? (
        <p className="chat-file-empty">Browse your computer’s workspace to see files.</p>
      ) : (
        !entries.length && (
          <p className="chat-file-empty">
            {filter.trim() ? 'No files match this search.' : 'This folder is empty.'}
          </p>
        )
      )}
      <p className="text-[11px] leading-relaxed text-gray-500">
        Select a file to collect it as a deliverable. Files up to 128 KiB can be collected.{' '}
        {chatEnded(chat) ? 'This computer has ended; showing its last folder observation.' : ''}
      </p>
    </section>
  );
}
