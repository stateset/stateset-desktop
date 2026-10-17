const SHORTCUTS = [
  { key: '⌘K', label: 'Command palette' },
  { key: '/', label: 'Search' },
  { key: '⌘N', label: 'New agent' },
  { key: '⌘R', label: 'Refresh' },
];

/** Static sidebar list of available keyboard shortcuts. */
export function ShortcutsHint() {
  return (
    <div className="px-1 space-y-1.5" role="list" aria-label="Keyboard shortcuts">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.key} className="flex items-center gap-2 text-gray-600" role="listitem">
          <kbd className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 bg-slate-800/60 text-gray-500 border border-slate-700/40 rounded text-[10px] font-bold">
            {shortcut.key}
          </kbd>
          <span className="text-[11px] font-medium">{shortcut.label}</span>
        </div>
      ))}
    </div>
  );
}
