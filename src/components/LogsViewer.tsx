import { memo, useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Download,
  Filter,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;
  details?: Record<string, unknown>;
}

interface LogsViewerProps {
  logs: LogEntry[];
  title?: string;
  maxHeight?: string;
  onClear?: () => void;
  onExport?: () => void;
}

const LOG_LEVEL_CONFIG: Record<LogLevel, { icon: React.ElementType; color: string; bg: string }> = {
  debug: { icon: Bug, color: 'text-gray-400', bg: 'bg-gray-800' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-900/30' },
  warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-900/30' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-900/30' },
};

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const LogsViewer = memo(function LogsViewer({
  logs,
  title = 'Logs',
  maxHeight = '400px',
  onClear,
  onExport,
}: LogsViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(
    new Set(['debug', 'info', 'warn', 'error'])
  );
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (!selectedLevels.has(log.level)) return false;

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return log.message.toLowerCase().includes(term) || log.source?.toLowerCase().includes(term);
      }

      return true;
    });
  }, [logs, selectedLevels, searchTerm]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  // Detect manual scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    const base = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${base}.${ms}`;
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const datePrefix = new Date().toISOString().split('T')[0];

  const handleExportTxt = () => {
    const content = filteredLogs
      .map(
        (log) =>
          `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
      )
      .join('\n');
    downloadBlob(content, `logs-${datePrefix}.txt`, 'text/plain');
    setShowExportMenu(false);
  };

  const handleExportJson = () => {
    const content = JSON.stringify(filteredLogs, null, 2);
    downloadBlob(content, `logs-${datePrefix}.json`, 'application/json');
    setShowExportMenu(false);
  };

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Level', 'Source', 'Message'];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.source || '',
      log.message,
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const value = String(cell);
            if (value.includes(',') || value.includes('\n') || value.includes('"')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',')
      ),
    ].join('\n');
    downloadBlob(csvContent, `logs-${datePrefix}.csv`, 'text/csv');
    setShowExportMenu(false);
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      setShowExportMenu((prev) => !prev);
    }
  };

  return (
    <div className="relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {filteredLogs.length} / {logs.length} logs
          </span>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-label={showFilters ? 'Hide log filters' : 'Show log filters'}
            className={clsx(
              'p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
              showFilters ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            )}
            title="Filter logs"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={handleExport}
              aria-label={showExportMenu ? 'Hide export options' : 'Show export options'}
              className={clsx(
                'p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                showExportMenu ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              )}
              title="Export logs"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Plain Text
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  <FileJson className="w-4 h-4" aria-hidden="true" />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                  CSV
                </button>
              </div>
            )}
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear logs"
              className="p-1.5 text-gray-400 hover:bg-gray-800 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              title="Clear logs"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-gray-800 overflow-hidden"
          >
            <div className="p-3 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search logs"
                  className="w-full pl-10 pr-10 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search term"
                    className="absolute right-3 top-1/2 -translate-y-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Level filters */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Levels:</span>
                {LOG_LEVELS.map((level) => {
                  const config = LOG_LEVEL_CONFIG[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      className={clsx(
                        'px-2 py-1 text-xs rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                        selectedLevels.has(level)
                          ? `${config.bg} ${config.color}`
                          : 'bg-gray-800 text-gray-500'
                      )}
                    >
                      {level.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log entries */}
      <div ref={containerRef} className="overflow-y-auto font-mono text-xs" style={{ maxHeight }}>
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Info className="w-8 h-8 mb-2" aria-hidden="true" />
            <p>No logs to display</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {filteredLogs.map((log) => {
              const config = LOG_LEVEL_CONFIG[log.level];
              const Icon = config.icon;
              const isExpanded = expandedLogs.has(log.id);
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div
                  key={log.id}
                  className={clsx(
                    'px-3 py-2 hover:bg-gray-800/30 transition-colors',
                    hasDetails && 'cursor-pointer'
                  )}
                  onClick={() => hasDetails && toggleExpanded(log.id)}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={clsx('w-3.5 h-3.5 mt-0.5 flex-shrink-0', config.color)}
                      aria-hidden="true"
                    />
                    <span className="text-gray-500 flex-shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    {log.source && (
                      <span className="text-gray-600 flex-shrink-0">[{log.source}]</span>
                    )}
                    <span className={clsx('flex-1', config.color)}>{log.message}</span>
                    {hasDetails && (
                      <ChevronDown
                        className={clsx(
                          'w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0',
                          isExpanded && 'rotate-180'
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {isExpanded && hasDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-2 ml-5 p-2 bg-gray-800 rounded text-gray-400 overflow-x-auto"
                    >
                      <pre>{JSON.stringify(log.details, null, 2)}</pre>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && filteredLogs.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          aria-label="Jump to latest log entry"
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs rounded-full shadow-lg border border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
});
