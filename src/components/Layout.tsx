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
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

  const navItems = useMemo(
    () => [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/playground', icon: MessageSquare, label: 'Playground' },
      { to: '/templates', icon: BookTemplate, label: 'Templates' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/connections', icon: Plug, label: 'Connections' },
      { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
      { to: '/audit-log', icon: ClipboardList, label: 'Audit Log' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
    []
  );

  const pageTitle = useMemo(() => {
    const exactMatch = navItems.find((item) => item.to === location.pathname);
    if (exactMatch) {
      return exactMatch.label;
    }

    if (location.pathname.startsWith('/agent/')) {
      return 'Agent Console';
    }

    return 'StateSet';
  }, [location.pathname, navItems]);

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
    <div className="app-shell flex h-screen overflow-hidden">
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
      <aside className="layout-sidebar w-64 flex flex-col z-20 backdrop-blur-xl">
        {/* Logo & Drag Region */}
        <div className="h-14 flex items-center px-5 border-b border-gray-800/60 drag-region">
          <div className="flex items-center gap-2.5 no-drag">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Bot className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              StateSet
            </span>
          </div>
        </div>

        {/* Brand Selector */}
        <div className="p-4 border-b border-gray-800/60">
          <div className="relative" ref={brandDropdownRef}>
            <button
              type="button"
              onClick={() => setShowBrandDropdown(!showBrandDropdown)}
              aria-label={`Select brand. Current: ${currentBrand?.name || 'None selected'}`}
              aria-expanded={showBrandDropdown}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 border border-gray-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 leading-none">
                  {tenant?.name}
                </span>
                <span className="text-sm font-semibold text-gray-200">
                  {currentBrand?.name || 'Select Brand'}
                </span>
              </div>
              <ChevronDown
                className={clsx(
                  'w-4 h-4 text-gray-500 transition-transform duration-200',
                  showBrandDropdown && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {showBrandDropdown && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                role="listbox"
                aria-label="Available brands"
                className="absolute top-full left-0 right-0 mt-2 py-1.5 bg-slate-900/95 border border-gray-800 rounded-xl shadow-2xl backdrop-blur-md z-50 overflow-hidden"
              >
                {brands.map((brand) => (
                  <button
                    type="button"
                    key={brand.id}
                    role="option"
                    aria-selected={currentBrand?.id === brand.id}
                    className={clsx(
                      'w-full px-4 py-2.5 text-left text-sm transition-all duration-150 focus-visible:outline-none',
                      currentBrand?.id === brand.id
                        ? 'bg-brand-500/10 text-brand-400 font-medium border-l-[3px] border-l-brand-400 pl-3.5'
                        : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200 border-l-[3px] border-l-transparent'
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
              </motion.div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl layout-nav-item transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  isActive
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20 shadow-sm shadow-brand-500/5 border-l-[3px] border-l-brand-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50 border-l-[3px] border-l-transparent'
                )
              }
            >
              <item.icon
                className="w-5 h-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
                aria-hidden="true"
              />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-gray-800/60 space-y-3">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout from StateSet"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            <span className="font-medium">Logout</span>
          </button>
          {appVersion && (
            <div className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold text-gray-600 text-center">
              v{appVersion}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, x: 4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="layout-main-content flex-1 flex flex-col overflow-hidden relative"
      >
        {/* Top bar for window controls (macOS style) */}
        <div className="layout-topbar h-14 drag-region flex items-center justify-end px-6 gap-3 sticky top-0 z-10">
          <div className="flex-1 min-w-0 no-drag">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400/80 font-medium">
              {tenant?.name ? `${tenant.name} workspace` : 'StateSet'}
            </p>
            <p className="text-sm md:text-base font-semibold text-gray-100 truncate">{pageTitle}</p>
          </div>
          <div className="flex items-center gap-2 no-drag">
            <ApiHealthIndicator />
            <div className="h-4 w-[1px] bg-gray-800/60 mx-1" />
            <NotificationsBell />
            <ThemeToggle className="hover:bg-slate-800/60 rounded-lg p-1 transition-colors" />
            <div className="h-4 w-[1px] bg-gray-800/60 mx-1" />

            <button
              type="button"
              onClick={openCommandPalette}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-slate-800/60 border border-transparent hover:border-gray-700/50 hover:shadow-lg hover:shadow-brand-500/5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Command palette (Ctrl/Cmd+K)"
              aria-label="Open command palette"
            >
              <Command
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-12"
                aria-hidden="true"
              />
              <span className="hidden lg:inline">Commands</span>
              <kbd className="hidden lg:flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-gray-500 border border-gray-700 rounded-md">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-slate-800/60 border border-transparent hover:border-gray-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Keyboard shortcuts (?)"
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
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
