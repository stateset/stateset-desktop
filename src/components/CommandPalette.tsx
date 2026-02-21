import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Search,
  Home,
  Plug,
  Settings,
  Bot,
  Plus,
  RefreshCw,
  Command,
  X,
  BarChart3,
  MessageSquare,
  Webhook,
  BookTemplate,
  ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  category: 'navigation' | 'actions' | 'agents';
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAgent?: () => void;
  onRefresh?: () => void;
  agents?: Array<{ id: string; agent_type: string; status: string; name?: string | null }>;
}

export function CommandPalette({
  isOpen,
  onClose,
  onCreateAgent,
  onRefresh,
  agents = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const dur = reduceMotion ? 0 : 0.2;

  const statusRank = (status: string): number => {
    switch (status) {
      case 'running':
        return 0;
      case 'paused':
        return 1;
      case 'starting':
        return 2;
      case 'stopping':
        return 3;
      case 'failed':
        return 4;
      case 'stopped':
        return 5;
      default:
        return 10;
    }
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const rankDelta = statusRank(a.status) - statusRank(b.status);
    if (rankDelta !== 0) return rankDelta;
    return (a.name || '').localeCompare(b.name || '');
  });

  const commands: CommandItem[] = [
    {
      id: 'home',
      label: 'Go to Dashboard',
      description: 'View all agents',
      icon: Home,
      shortcut: 'Ctrl/Cmd+H',
      action: () => {
        navigate('/');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'analytics',
      label: 'Go to Analytics',
      description: 'Usage and performance insights',
      icon: BarChart3,
      shortcut: 'Ctrl/Cmd+Shift+A',
      action: () => {
        navigate('/analytics');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'connections',
      label: 'Go to Connections',
      description: 'Manage platform integrations',
      icon: Plug,
      shortcut: 'Ctrl/Cmd+Shift+C',
      action: () => {
        navigate('/connections');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'settings',
      label: 'Go to Settings',
      description: 'Configure preferences',
      icon: Settings,
      shortcut: 'Ctrl/Cmd+,',
      action: () => {
        navigate('/settings');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'playground',
      label: 'Go to Playground',
      description: 'Chat with agents directly',
      icon: MessageSquare,
      shortcut: 'Ctrl/Cmd+Shift+P',
      action: () => {
        navigate('/playground');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'webhooks',
      label: 'Go to Webhooks',
      description: 'Manage webhook endpoints',
      icon: Webhook,
      action: () => {
        navigate('/webhooks');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'templates',
      label: 'Go to Templates',
      description: 'Browse agent templates',
      icon: BookTemplate,
      action: () => {
        navigate('/templates');
        onClose();
      },
      category: 'navigation',
    },
    {
      id: 'audit-log',
      label: 'Go to Audit Log',
      description: 'View activity audit log',
      icon: ClipboardList,
      action: () => {
        navigate('/audit-log');
        onClose();
      },
      category: 'navigation',
    },
    ...(onCreateAgent
      ? [
          {
            id: 'new-agent',
            label: 'Create New Agent',
            description: 'Start a new agent session',
            icon: Plus,
            shortcut: 'Ctrl/Cmd+N',
            action: () => {
              onCreateAgent();
              onClose();
            },
            category: 'actions' as const,
          },
        ]
      : []),
    ...(onRefresh
      ? [
          {
            id: 'refresh',
            label: 'Refresh Data',
            description: 'Reload current data',
            icon: RefreshCw,
            shortcut: 'Ctrl/Cmd+R',
            action: () => {
              onRefresh();
              onClose();
            },
            category: 'actions' as const,
          },
        ]
      : []),
    ...sortedAgents.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name?.trim()
        ? agent.name.trim()
        : `${agent.agent_type.charAt(0).toUpperCase() + agent.agent_type.slice(1)} Agent`,
      description: `Status: ${agent.status}${
        agent.name?.trim()
          ? ` • ${agent.agent_type.charAt(0).toUpperCase() + agent.agent_type.slice(1)}`
          : ''
      }`,
      icon: Bot,
      action: () => {
        navigate(`/agent/${agent.id}`);
        onClose();
      },
      category: 'agents' as const,
    })),
  ];

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description?.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (filteredCommands.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 < 0 ? Math.max(filteredCommands.length - 1, 0) : i - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, filteredCommands, selectedIndex, onClose]
  );

  useEffect(() => {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && returnFocusRef.current) {
      if (returnFocusRef.current.isConnected) {
        returnFocusRef.current.focus();
      }
      returnFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((previousIndex) => {
      if (filteredCommands.length === 0) {
        return 0;
      }
      if (previousIndex >= filteredCommands.length) {
        return Math.max(filteredCommands.length - 1, 0);
      }
      return previousIndex;
    });
  }, [query, filteredCommands.length]);

  useEffect(() => {
    const selectedId = filteredCommands[selectedIndex]?.id;
    if (!isOpen || !selectedId) return;

    const selectedElement = document.getElementById(`command-option-${selectedId}`);
    selectedElement?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [filteredCommands, selectedIndex, isOpen]);

  const selectedId = filteredCommands[selectedIndex]?.id;

  const groupedCommands = {
    navigation: filteredCommands.filter((c) => c.category === 'navigation'),
    actions: filteredCommands.filter((c) => c.category === 'actions'),
    agents: filteredCommands.filter((c) => c.category === 'agents'),
  };

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-slate-950/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: dur, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            className="w-[min(92vw,36rem)] bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="command-palette-title" className="sr-only">
              Command Palette
            </h2>
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-slate-900/50">
              <Search className="w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                id="command-palette-search"
                ref={inputRef}
                role="searchbox"
                autoComplete="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-controls="command-palette-results"
                aria-label="Search commands"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands..."
                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none text-lg font-medium"
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-bold text-gray-500 bg-slate-800/80 border border-slate-700 rounded-md">
                <Command className="w-3 h-3" aria-hidden="true" />K
              </kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close command palette"
                className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300 hover:bg-slate-800/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Results */}
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {filteredCommands.length} command{filteredCommands.length === 1 ? '' : 's'} available
            </div>

            <div
              id="command-palette-results"
              role="listbox"
              aria-activedescendant={selectedId ? `command-option-${selectedId}` : undefined}
              className="max-h-[60vh] overflow-y-auto p-2 scroll-smooth"
            >
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-12 text-center text-gray-500">
                  <p className="text-sm">No commands found for "{query}"</p>
                </div>
              ) : (
                <>
                  {groupedCommands.navigation.length > 0 && (
                    <CommandGroup
                      title="Navigation"
                      commands={groupedCommands.navigation}
                      selectedIndex={selectedIndex}
                      startIndex={0}
                      onHoverIndex={(nextIndex) => setSelectedIndex(nextIndex)}
                    />
                  )}
                  {groupedCommands.actions.length > 0 && (
                    <CommandGroup
                      title="Actions"
                      commands={groupedCommands.actions}
                      selectedIndex={selectedIndex}
                      startIndex={groupedCommands.navigation.length}
                      onHoverIndex={(nextIndex) => setSelectedIndex(nextIndex)}
                    />
                  )}
                  {groupedCommands.agents.length > 0 && (
                    <CommandGroup
                      title="Agents"
                      commands={groupedCommands.agents}
                      selectedIndex={selectedIndex}
                      startIndex={
                        groupedCommands.navigation.length + groupedCommands.actions.length
                      }
                      onHoverIndex={(nextIndex) => setSelectedIndex(nextIndex)}
                    />
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700/60 bg-slate-900/50 text-[11px] font-medium text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-800/80 border border-slate-700 rounded-md">
                    ↑↓
                  </kbd>{' '}
                  Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-800/80 border border-slate-700 rounded-md">
                    ↵
                  </kbd>{' '}
                  Select
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-800/80 border border-slate-700 rounded-md">
                    Esc
                  </kbd>{' '}
                  Close
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

interface CommandGroupProps {
  title: string;
  commands: CommandItem[];
  selectedIndex: number;
  startIndex: number;
  onHoverIndex: (index: number) => void;
}

function CommandGroup({
  title,
  commands,
  selectedIndex,
  startIndex,
  onHoverIndex,
}: CommandGroupProps) {
  return (
    <div role="presentation" className="mb-2.5">
      <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-slate-900/50 sticky top-0 backdrop-blur-md z-10">
        {title}
      </div>
      <div className="px-2 space-y-0.5 mt-1">
        {commands.map((cmd, i) => {
          const Icon = cmd.icon;
          const isSelected = selectedIndex === startIndex + i;
          return (
            <button
              type="button"
              key={cmd.id}
              id={`command-option-${cmd.id}`}
              onClick={cmd.action}
              role="option"
              aria-selected={isSelected}
              aria-label={cmd.label}
              onMouseEnter={() => onHoverIndex(startIndex + i)}
              onFocus={() => onHoverIndex(startIndex + i)}
              className={clsx(
                'w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                isSelected
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20 border-l-2 border-l-brand-400 shadow-sm shadow-brand-500/5'
                  : 'hover:bg-slate-800/60 text-gray-300 border border-transparent hover:border-slate-700/50'
              )}
            >
              <div
                className={clsx(
                  'p-1.5 rounded-lg transition-colors',
                  isSelected ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800/80 text-gray-400'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              </div>
              <div className="flex-1 text-left">
                <div
                  className={clsx(
                    'font-medium text-sm',
                    isSelected ? 'text-white' : 'text-gray-200'
                  )}
                >
                  {cmd.label}
                </div>
                {cmd.description && (
                  <div
                    className={clsx(
                      'text-xs mt-0.5',
                      isSelected ? 'text-brand-200/80' : 'text-gray-500'
                    )}
                  >
                    {cmd.description}
                  </div>
                )}
              </div>
              {cmd.shortcut && (
                <kbd
                  className={clsx(
                    'px-2 py-1 text-[10px] font-bold rounded-md border',
                    isSelected
                      ? 'bg-brand-500/20 text-brand-300 border-brand-500/30'
                      : 'bg-slate-800/80 text-gray-500 border-slate-700'
                  )}
                >
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
