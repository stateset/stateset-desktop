import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const MOD_KEY = 'Ctrl/Cmd';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const location = useLocation();

  const shortcutGroups = useMemo<ShortcutGroup[]>(() => {
    const groups: ShortcutGroup[] = [
      {
        title: 'Global',
        shortcuts: [
          { keys: [MOD_KEY, 'K'], description: 'Open command palette' },
          { keys: [MOD_KEY, 'N'], description: 'Create new agent' },
          { keys: [MOD_KEY, 'R'], description: 'Refresh data' },
          { keys: ['?'], description: 'Show keyboard shortcuts' },
        ],
      },
      {
        title: 'Navigation',
        shortcuts: [
          { keys: [MOD_KEY, 'H'], description: 'Go to Dashboard' },
          { keys: [MOD_KEY, 'Shift', 'A'], description: 'Go to Analytics' },
          { keys: [MOD_KEY, 'Shift', 'C'], description: 'Go to Connections' },
          { keys: [MOD_KEY, 'Shift', 'P'], description: 'Go to Playground' },
          { keys: [MOD_KEY, ','], description: 'Go to Settings' },
        ],
      },
    ];

    if (location.pathname === '/') {
      groups.push({
        title: 'Dashboard',
        shortcuts: [
          { keys: ['/'], description: 'Focus search' },
          { keys: ['Esc'], description: 'Clear search & filters' },
        ],
      });
    }

    if (location.pathname.startsWith('/agent/')) {
      groups.push({
        title: 'Agent Console',
        shortcuts: [
          { keys: ['Enter'], description: 'Send message' },
          { keys: ['Shift', 'Enter'], description: 'New line in message' },
          { keys: [MOD_KEY, 'F'], description: 'Search in conversation' },
          { keys: [MOD_KEY, 'E'], description: 'Export conversation' },
          { keys: [MOD_KEY, 'Shift', 'L'], description: 'Toggle logs panel' },
          { keys: ['Esc'], description: 'Close search/logs panels' },
        ],
      });
    }

    return groups;
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-xl shadow-xl max-h-[80vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Keyboard className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                  <p className="text-sm text-gray-400">Quick actions to boost your productivity</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <div className="space-y-6">
                {shortcutGroups.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      {group.title}
                    </h3>
                    <div className="space-y-2">
                      {group.shortcuts.map((shortcut, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-800/50"
                        >
                          <span className="text-gray-300">{shortcut.description}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, j) => (
                              <span key={j} className="flex items-center">
                                <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300">
                                  {key}
                                </kbd>
                                {j < shortcut.keys.length - 1 && (
                                  <span className="mx-1 text-gray-600">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/50">
              <p className="text-xs text-gray-500 text-center">
                Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">?</kbd>{' '}
                anytime to show this help
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
