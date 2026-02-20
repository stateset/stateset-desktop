import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useSessionsCache } from '../hooks/useOfflineCache';
import type { AgentSession } from '../types';
import {
  LayoutDashboard,
  Bot,
  Plug,
  Settings,
  LogOut,
  ChevronDown,
  Keyboard,
  BarChart3,
  Command,
  MessageSquare,
  Webhook,
  BookTemplate,
  ClipboardList,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ApiHealthIndicator } from './ApiHealthIndicator';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { ThemeToggle } from './ThemeToggle';
import { NotificationsCenter } from './NotificationsCenter';
import { useNotificationsStore } from '../stores/notifications';
import { useAuditLogStore } from '../stores/auditLog';

interface LayoutProps {
  children: React.ReactNode;
}

function NotificationsBell() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const clearAll = useNotificationsStore((s) => s.clearAll);

  return (
    <div className="no-drag">
      <NotificationsCenter
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onDismiss={dismiss}
        onClearAll={clearAll}
      />
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { tenant, currentBrand, brands, setCurrentBrand, logout } = useAuthStore();
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const commandPaletteAgents = useUiStore((state) => state.commandPaletteAgents);
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const closeCommandPalette = useUiStore((state) => state.closeCommandPalette);
  const setCommandPaletteAgents = useUiStore((state) => state.setCommandPaletteAgents);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  // Load app version on mount
  useEffect(() => {
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(setAppVersion);
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login');
  };

  const handleRefreshData = useCallback(() => {
    void queryClient.refetchQueries({ type: 'active' });
  }, [queryClient]);

  const { cacheFromQuery, getCachedSessions, isOnline } = useSessionsCache(
    tenant?.id,
    currentBrand?.id
  );

  // Keep command palette agents list populated even if the user never visits Dashboard.
  const sessionsQuery = useQuery<AgentSession[]>({
    queryKey: queryKeys.sessions.list(tenant?.id, currentBrand?.id),
    queryFn: async () => {
      if (!tenant?.id) return [];

      if (!isOnline) {
        const cached = await getCachedSessions();
        return cached ?? [];
      }

      const sessions = await agentApi.listSessions(tenant.id, currentBrand?.id);
      await cacheFromQuery(sessions);
      return sessions;
    },
    enabled: Boolean(tenant?.id),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });

  // Mirror sessions list into a lightweight store for the command palette.
  useEffect(() => {
    setCommandPaletteAgents(
      (sessionsQuery.data ?? []).map((s) => ({
        id: s.id,
        agent_type: s.agent_type,
        status: s.status,
        name: s.name,
      }))
    );
  }, [sessionsQuery.data, setCommandPaletteAgents]);

  // Global keyboard shortcut for help
  const handleGlobalKeyboard = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Ignore if user is typing in an input or textarea
      const isTypingTarget =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable;
      if (isTypingTarget && !(e.ctrlKey || e.metaKey)) {
        return;
      }

      const key = e.key.toLowerCase();

      // Ctrl/Cmd+K opens command palette
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        openCommandPalette();
        return;
      }

      // Ctrl/Cmd+N creates a new agent (route-driven so it works globally)
      if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault();
        navigate('/?create=1');
        return;
      }

      // Navigation shortcuts (kept in sync with Command Palette labels)
      if ((e.ctrlKey || e.metaKey) && key === 'h') {
        e.preventDefault();
        navigate('/');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'a') {
        e.preventDefault();
        navigate('/analytics');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'c') {
        e.preventDefault();
        navigate('/connections');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'p') {
        e.preventDefault();
        navigate('/playground');
        return;
      }

      // Ctrl/Cmd+R refreshes app data (avoid full reload)
      if ((e.ctrlKey || e.metaKey) && key === 'r') {
        e.preventDefault();
        handleRefreshData();
        return;
      }

      // ? key opens keyboard shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal(true);
      }
    },
    [handleRefreshData, navigate, openCommandPalette]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyboard);
    return () => document.removeEventListener('keydown', handleGlobalKeyboard);
  }, [handleGlobalKeyboard]);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/playground', icon: MessageSquare, label: 'Playground' },
    { to: '/templates', icon: BookTemplate, label: 'Templates' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/connections', icon: Plug, label: 'Connections' },
    { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
    { to: '/audit-log', icon: ClipboardList, label: 'Audit Log' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  useEffect(() => {
    if (!showBrandDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBrandDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showBrandDropdown]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-slate-950 to-gray-900">
      {/* Skip to main content link — visible on focus for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        onCreateAgent={() => navigate('/?create=1')}
        onRefresh={handleRefreshData}
        agents={commandPaletteAgents}
      />

      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800/90 bg-gray-900/85 backdrop-blur-md flex flex-col">
        {/* Logo & Drag Region */}
        <div className="h-14 flex items-center px-4 border-b border-gray-800/90 bg-gray-900/95 drag-region">
          <div className="flex items-center gap-2 no-drag">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold text-lg tracking-tight">StateSet</span>
          </div>
        </div>

        {/* Brand Selector */}
        <div className="p-3 border-b border-gray-800">
          <div className="relative" ref={brandDropdownRef}>
            <button
              type="button"
              onClick={() => setShowBrandDropdown(!showBrandDropdown)}
              aria-label={`Select brand. Current: ${currentBrand?.name || 'None selected'}`}
              aria-expanded={showBrandDropdown}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/95 hover:bg-gray-800 border border-gray-800 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            >
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-500">{tenant?.name}</span>
                <span className="text-sm font-medium">{currentBrand?.name || 'Select Brand'}</span>
              </div>
              <ChevronDown
                className={clsx(
                  'w-4 h-4 text-gray-500 transition-transform',
                  showBrandDropdown && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {showBrandDropdown && (
              <div
                role="listbox"
                aria-label="Available brands"
                className="absolute top-full left-0 right-0 mt-1 py-1 bg-gray-900/95 border border-gray-800 rounded-lg shadow-xl backdrop-blur-sm z-50"
              >
                {brands.map((brand) => (
                  <button
                    type="button"
                    key={brand.id}
                    role="option"
                    aria-selected={currentBrand?.id === brand.id}
                    className={clsx(
                      'w-full px-3 py-2 text-left text-sm hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                      currentBrand?.id === brand.id && 'bg-gray-800 text-brand-400'
                    )}
                    onClick={() => {
                      setCurrentBrand(brand);
                      setShowBrandDropdown(false);
                      useAuditLogStore
                        .getState()
                        .log('brand.switched', `Switched to brand "${brand.name}"`, {
                          brandId: brand.id,
                        });
                    }}
                  >
                    {brand.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 p-3 space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 px-3 py-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-600/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                )
              }
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout from StateSet"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-1"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            <span>Logout</span>
          </button>
          {appVersion && (
            <div className="px-3 py-1 text-xs text-gray-600 text-center">v{appVersion}</div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0.85, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Top bar for window controls (macOS style) */}
        <div className="h-11 drag-region flex items-center justify-end px-4 border-b border-gray-800/70 gap-2 bg-gray-950/85 backdrop-blur-md sticky top-0 z-10">
          <ApiHealthIndicator />
          <NotificationsBell />
          <ThemeToggle className="no-drag" />
          <button
            type="button"
            onClick={openCommandPalette}
            className="no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            title="Command palette (Ctrl/Cmd+K)"
            aria-label="Open command palette"
          >
            <Command className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="hidden sm:inline px-1 py-0.5 text-[10px] bg-gray-800 border border-gray-700 rounded">
              Ctrl/Cmd+K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Shortcuts</span>
            <kbd className="hidden sm:inline px-1 py-0.5 text-[10px] bg-gray-800 border border-gray-700 rounded">
              ?
            </kbd>
          </button>
        </div>

        {/* Page Content */}
        <div id="main-content" className="flex-1 overflow-auto">
          {children}
        </div>
      </motion.main>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
}
