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
  BarChart3,
  MessageSquare,
  Webhook,
  BookTemplate,
  ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

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
  const navigate = useNavigate();

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

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
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
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const groupedCommands = {
    navigation: filteredCommands.filter((c) => c.category === 'navigation'),
    actions: filteredCommands.filter((c) => c.category === 'actions'),
    agents: filteredCommands.filter((c) => c.category === 'agents'),
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
            <Search className="w-5 h-5 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-gray-800 rounded">
              <Command className="w-3 h-3" />K
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">No commands found</div>
            ) : (
              <>
                {groupedCommands.navigation.length > 0 && (
                  <CommandGroup
                    title="Navigation"
                    commands={groupedCommands.navigation}
                    selectedIndex={selectedIndex}
                    startIndex={0}
                  />
                )}
                {groupedCommands.actions.length > 0 && (
                  <CommandGroup
                    title="Actions"
                    commands={groupedCommands.actions}
                    selectedIndex={selectedIndex}
                    startIndex={groupedCommands.navigation.length}
                  />
                )}
                {groupedCommands.agents.length > 0 && (
                  <CommandGroup
                    title="Agents"
                    commands={groupedCommands.agents}
                    selectedIndex={selectedIndex}
                    startIndex={groupedCommands.navigation.length + groupedCommands.actions.length}
                  />
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↑↓</kbd> Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↵</kbd> Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Esc</kbd> Close
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

interface CommandGroupProps {
  title: string;
  commands: CommandItem[];
  selectedIndex: number;
  startIndex: number;
}

function CommandGroup({ title, commands, selectedIndex, startIndex }: CommandGroupProps) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {title}
      </div>
      {commands.map((cmd, i) => {
        const Icon = cmd.icon;
        const isSelected = selectedIndex === startIndex + i;
        return (
          <button
            key={cmd.id}
            onClick={cmd.action}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              isSelected ? 'bg-brand-600 text-white' : 'hover:bg-gray-800 text-gray-300'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 text-left">
              <div className="font-medium">{cmd.label}</div>
              {cmd.description && (
                <div className={clsx('text-xs', isSelected ? 'text-brand-200' : 'text-gray-500')}>
                  {cmd.description}
                </div>
              )}
            </div>
            {cmd.shortcut && (
              <kbd
                className={clsx(
                  'px-2 py-0.5 text-xs rounded',
                  isSelected ? 'bg-brand-700 text-brand-200' : 'bg-gray-800 text-gray-500'
                )}
              >
                {cmd.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
