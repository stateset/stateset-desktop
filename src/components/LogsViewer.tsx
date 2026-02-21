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

const LOG_LEVEL_CONFIG: Record<
  LogLevel,
  { icon: React.ElementType; color: string; bg: string; activeBorder: string; leftBorder: string }
> = {
  debug: {
    icon: Bug,
    color: 'text-gray-400',
    bg: 'bg-slate-800/60',
    activeBorder: 'border-gray-400/30',
    leftBorder: 'border-l-gray-500/40',
  },
  info: {
    icon: Info,
    color: 'text-brand-400',
    bg: 'bg-brand-500/15',
    activeBorder: 'border-brand-400/30',
    leftBorder: 'border-l-brand-400/40',
  },
  warn: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    activeBorder: 'border-amber-400/30',
    leftBorder: 'border-l-amber-400/60',
  },
  error: {
    icon: AlertCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/15',
    activeBorder: 'border-rose-400/30',
    leftBorder: 'border-l-rose-400/60',
  },
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
    <div className="relative bg-slate-900/60 border border-slate-700/60 rounded-2xl overflow-hidden backdrop-blur-md shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/60 bg-slate-900/40">
        <h3 className="font-bold text-gray-200">{title}</h3>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-gray-500">
            {filteredLogs.length} / {logs.length} logs
          </span>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-label={showFilters ? 'Hide log filters' : 'Show log filters'}
            className={clsx(
              'p-2 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              showFilters
                ? 'bg-brand-500/20 text-brand-400 shadow-inner'
                : 'text-gray-400 hover:bg-slate-800/80 hover:text-gray-200 shadow-sm'
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
                'p-2 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                showExportMenu
                  ? 'bg-brand-500/20 text-brand-400 shadow-inner'
                  : 'text-gray-400 hover:bg-slate-800/80 hover:text-gray-200 shadow-sm'
              )}
              title="Export logs"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-slate-900/90 border border-slate-700/60 rounded-xl shadow-2xl z-10 py-1.5 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-800/80 hover:text-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Plain Text
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-800/80 hover:text-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <FileJson className="w-4 h-4" aria-hidden="true" />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-800/80 hover:text-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
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
              className="p-2 text-gray-400 hover:bg-slate-800/80 hover:text-gray-200 rounded-xl transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
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
            className="border-b border-slate-700/60 bg-slate-900/20 overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search logs"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm font-medium placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-inner transition-all focus-glow"
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
                        'px-2.5 py-1 text-[11px] font-bold tracking-wider rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                        selectedLevels.has(level)
                          ? `${config.bg} ${config.color} border ${config.activeBorder} shadow-sm`
                          : 'bg-slate-800/40 text-gray-500 border border-transparent hover:bg-slate-800/60 hover:text-gray-300'
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
      <div
        ref={containerRef}
        className="overflow-y-auto font-mono text-[11px] font-medium"
        style={{ maxHeight }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Info className="w-10 h-10 mb-3 opacity-50" aria-hidden="true" />
            <p className="font-sans text-sm">No logs to display</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/40">
            {filteredLogs.map((log) => {
              const config = LOG_LEVEL_CONFIG[log.level];
              const Icon = config.icon;
              const isExpanded = expandedLogs.has(log.id);
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div
                  key={log.id}
                  className={clsx(
                    'px-4 py-2.5 transition-colors duration-150 border-l-2',
                    config.leftBorder,
                    hasDetails ? 'cursor-pointer hover:bg-slate-800/40' : 'hover:bg-slate-800/20'
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
                      className="mt-2.5 ml-6 p-3 bg-slate-900/60 border border-slate-700/40 rounded-xl text-gray-400 overflow-x-auto shadow-inner"
                    >
                      <pre className="text-[10px]">{JSON.stringify(log.details, null, 2)}</pre>
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
          className="absolute bottom-5 right-5 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-gray-200 text-xs font-bold tracking-wide rounded-full shadow-lg border border-slate-600/50 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-all"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
});
