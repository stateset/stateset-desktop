import { useState, useMemo, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Search, Trash2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuditLogStore } from '../stores/auditLog';
import { AUDIT_ACTION_COLORS, AUDIT_ACTION_LABELS, type AuditAction } from '../lib/auditLog';

const ACTION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Actions' },
  { value: 'agent.created', label: 'Agent Created' },
  { value: 'agent.started', label: 'Agent Started' },
  { value: 'agent.stopped', label: 'Agent Stopped' },
  { value: 'agent.deleted', label: 'Agent Deleted' },
  { value: 'config.changed', label: 'Config Changed' },
  { value: 'template.created', label: 'Template Created' },
  { value: 'template.deleted', label: 'Template Deleted' },
  { value: 'webhook.created', label: 'Webhook Created' },
  { value: 'webhook.deleted', label: 'Webhook Deleted' },
  { value: 'brand.switched', label: 'Brand Switched' },
  { value: 'user.login', label: 'Login' },
  { value: 'user.logout', label: 'Logout' },
  { value: 'settings.changed', label: 'Settings Changed' },
];

export default function AuditLog() {
  usePageTitle('Audit Log');
  const { entries, initialize, clear } = useAuditLogStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          entry.description.toLowerCase().includes(q) || entry.action.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, actionFilter, searchQuery]);

  const handleClear = async () => {
    await clear();
    setShowClearConfirm(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-gray-400 mt-1">
            Track all actions performed in the application
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            aria-label="Clear all audit log entries"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Clear All
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit log..."
            aria-label="Search audit log"
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Filter audit log actions"
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          {ACTION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-block px-2 py-0.5 text-xs font-medium rounded border',
                        AUDIT_ACTION_COLORS[entry.action as AuditAction]
                      )}
                    >
                      {AUDIT_ACTION_LABELS[entry.action as AuditAction] || entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{entry.description}</td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <p className="text-sm">
            {searchQuery || actionFilter !== 'all'
              ? 'No entries match your filters'
              : 'No audit log entries yet'}
          </p>
        </div>
      )}

      {/* Clear Confirm Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-audit-log-title"
            aria-describedby="clear-audit-log-description"
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
              </div>
              <h3 id="clear-audit-log-title" className="text-lg font-semibold">
                Clear Audit Log
              </h3>
            </div>
            <p id="clear-audit-log-description" className="text-sm text-gray-400 mb-6">
              This will permanently delete all {entries.length} audit log entries. This action
              cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
