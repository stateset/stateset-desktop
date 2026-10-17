import { NavLink, useLocation, useNavigate } from 'react-router';
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
  Mic,
  Webhook,
  BookTemplate,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Workflow,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { ApiHealthIndicator } from './ApiHealthIndicator';
import { WorkspaceCommandPalette } from '../features/computer-chat/WorkspaceCommandPalette';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { ThemeToggle } from './ThemeToggle';
import { NotificationsCenter } from './NotificationsCenter';
import { useNotificationsStore } from '../stores/notifications';
import { usePopupNavigation } from '../hooks/usePopupNavigation';
import { useAuditLogStore } from '../stores/auditLog';

interface LayoutProps {
  children: React.ReactNode;
  banner?: React.ReactNode;
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

export default function Layout({ children, banner }: LayoutProps) {
  const reduceMotion = useReducedMotionConfig();
  const { tenant, currentBrand, brands, setCurrentBrand, logout } = useAuthStore();
  const brandMenu = usePopupNavigation('listbox');
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
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Scroll main content to top on page navigation
  useLayoutEffect(() => {
    mainContentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

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

      // Escape always closes command palette first when open.
      if (key === 'escape' && commandPaletteOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeCommandPalette();
        return;
      }

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

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'v') {
        e.preventDefault();
        navigate('/voice');
        return;
      }

      // Ctrl/Cmd+B toggles sidebar
      if ((e.ctrlKey || e.metaKey) && key === 'b') {
        e.preventDefault();
        toggleSidebar();
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
    [
      commandPaletteOpen,
      closeCommandPalette,
      handleRefreshData,
      navigate,
      openCommandPalette,
      toggleSidebar,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyboard);
    return () => document.removeEventListener('keydown', handleGlobalKeyboard);
  }, [handleGlobalKeyboard]);

  const navItems = useMemo(
    () => [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/playground', icon: MessageSquare, label: 'Chats' },
      { to: '/voice', icon: Mic, label: 'Voice' },
      { to: '/templates', icon: BookTemplate, label: 'Templates' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/connections', icon: Plug, label: 'Connections' },
      { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
      { to: '/workflows', icon: Workflow, label: 'Workflows' },
      { to: '/audit-log', icon: ClipboardList, label: 'Audit Log' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
    []
  );

  const enabledBrands = useMemo(() => brands.filter((brand) => brand.enabled), [brands]);
  const disabledBrands = useMemo(() => brands.filter((brand) => !brand.enabled), [brands]);
  const hasEnabledBrands = enabledBrands.length > 0;
  const visibleBrandName =
    currentBrand?.name || (hasEnabledBrands ? 'Select Brand' : 'No Active Brands');
  const brandTriggerName = sidebarCollapsed
    ? currentBrand?.name || 'None selected'
    : [tenant?.name, visibleBrandName].filter(Boolean).join(' ');

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

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Skip to main content link — visible on focus for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <WorkspaceCommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        onCreateAgent={() => navigate('/?create=1')}
        onRefresh={handleRefreshData}
        agents={commandPaletteAgents}
      />

      {/* Sidebar */}
      <aside
        className={clsx(
          'layout-sidebar flex flex-col shrink-0 z-20 transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[68px]' : 'w-56'
        )}
      >
        {/* Logo & Drag Region */}
        <div className="h-14 flex items-center px-5 border-b border-gray-800/60 drag-region">
          <div className="flex items-center gap-2.5 no-drag">
            <div>
              <div className="w-7 h-7 rounded-lg bg-slate-800/50 flex items-center justify-center">
                <Bot className="w-4 h-4 text-gray-300" aria-hidden="true" />
              </div>
            </div>
            {!sidebarCollapsed && (
              <span className="font-medium text-base tracking-tight text-gray-200">StateSet</span>
            )}
          </div>
        </div>

        {/* Brand Selector */}
        <div className={clsx('border-b border-gray-800/60', sidebarCollapsed ? 'p-2' : 'p-4')}>
          <div className="relative" {...brandMenu.containerProps}>
            <button
              type="button"
              {...brandMenu.triggerProps}
              aria-label={`Select brand. Current: ${brandTriggerName}`}
              title={sidebarCollapsed ? currentBrand?.name || 'Select Brand' : undefined}
              className={clsx(
                'ui-workspace-trigger flex items-center rounded-lg transition-colors',
                sidebarCollapsed
                  ? 'w-10 h-10 mx-auto justify-center'
                  : 'w-full justify-between px-2.5 py-2'
              )}
            >
              {sidebarCollapsed ? (
                <span className="text-xs font-semibold uppercase" aria-hidden="true">
                  {(currentBrand?.name || '?').charAt(0)}
                </span>
              ) : (
                <>
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="text-[11px] text-gray-500 leading-none truncate max-w-full">
                      {tenant?.name}
                    </span>{' '}
                    <span className="text-sm font-medium truncate max-w-full">
                      {visibleBrandName}
                    </span>
                  </span>
                  <ChevronDown
                    className={clsx(
                      'w-4 h-4 shrink-0 ml-2 text-gray-500 transition-transform duration-200',
                      brandMenu.isOpen && 'rotate-180'
                    )}
                    aria-hidden="true"
                  />
                </>
              )}
            </button>

            {brandMenu.isOpen && (
              <div
                {...brandMenu.popupProps}
                aria-label="Available brands"
                className={clsx(
                  'ui-popup absolute p-1 rounded-lg z-50 max-h-[min(28rem,60vh)] overflow-y-auto',
                  sidebarCollapsed ? 'left-full top-0 ml-3 w-60' : 'top-full left-0 right-0 mt-2'
                )}
              >
                {brands.length === 0 && (
                  <div className="px-4 py-2.5 text-sm text-gray-500">No brands available</div>
                )}

                {!hasEnabledBrands && brands.length > 0 && (
                  <div className="px-4 py-2 text-xs text-amber-300/90 border-b border-amber-500/20 bg-amber-500/5">
                    No active brands available for agent actions.
                  </div>
                )}

                {enabledBrands.map((brand) => (
                  <button
                    type="button"
                    key={brand.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={currentBrand?.id === brand.id}
                    className="ui-popup-item w-full px-3 py-2 text-left text-sm rounded-md"
                    onClick={() => {
                      brandMenu.close(true);
                      if (currentBrand?.id === brand.id) {
                        return;
                      }

                      setCurrentBrand(brand);
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

                {disabledBrands.length > 0 && (
                  <>
                    <div className="my-1 border-t border-gray-800/80" />
                    <div className="ui-popup-label px-3 py-1 text-[10px] uppercase tracking-widest font-medium">
                      Disabled
                    </div>
                    {disabledBrands.map((brand) => (
                      <button
                        type="button"
                        key={brand.id}
                        role="option"
                        tabIndex={-1}
                        aria-selected={false}
                        disabled
                        className="w-full px-4 py-2 text-left text-sm text-gray-500/80 cursor-not-allowed opacity-80 flex items-center justify-between"
                      >
                        <span className="truncate">{brand.name}</span>
                        <span className="ml-2 rounded-md border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          Disabled
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className={clsx(
            'min-h-0 flex-1 overflow-y-auto space-y-1',
            sidebarCollapsed ? 'p-2' : 'p-4'
          )}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center rounded-lg layout-nav-item text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  sidebarCollapsed ? 'justify-center px-2.5 py-2.5' : 'gap-3 px-3.5 py-2.5',
                  isActive
                    ? 'bg-slate-800/60 text-gray-100'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/40'
                )
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        <div
          className={clsx(
            'border-t border-gray-800/60 space-y-2',
            sidebarCollapsed ? 'p-2' : 'p-4'
          )}
        >
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx(
              'w-full flex items-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-slate-800/50 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              sidebarCollapsed ? 'justify-center px-2.5 py-2' : 'gap-3 px-3.5 py-2'
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">Collapse</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout from StateSet"
            title={sidebarCollapsed ? 'Logout' : undefined}
            className={clsx(
              'w-full flex items-center rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40',
              sidebarCollapsed ? 'justify-center px-2.5 py-2.5' : 'gap-3 px-3.5 py-2.5'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span className="font-medium">Logout</span>}
          </button>
          {!sidebarCollapsed && appVersion && (
            <div className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold text-gray-600 text-center">
              v{appVersion}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <motion.main
        key={location.pathname}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="layout-main-content flex-1 flex flex-col overflow-hidden relative"
      >
        {/* Top bar for window controls (macOS style) */}
        <div className="layout-topbar h-14 shrink-0 drag-region flex items-center justify-end px-6 gap-3 sticky top-0 z-10">
          <div className="flex-1 min-w-0 no-drag">
            <p className="truncate text-[11px] text-gray-500">
              {tenant?.name ? `${tenant.name} workspace` : 'StateSet'}
            </p>
            <p className="layout-page-title text-sm font-medium text-gray-100 truncate tracking-tight">
              {pageTitle}
            </p>
          </div>
          <div className="layout-topbar-actions flex shrink-0 items-center gap-2 no-drag">
            <ApiHealthIndicator />
            <div className="layout-topbar-separator h-4 w-[1px] bg-gray-800/60 mx-1" />
            <NotificationsBell />
            <ThemeToggle className="hover:bg-slate-800/60 rounded-lg p-1 transition-colors" />
            <div className="layout-topbar-separator h-4 w-[1px] bg-gray-800/60 mx-1" />

            <button
              type="button"
              onClick={openCommandPalette}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-slate-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Command palette (Ctrl/Cmd+K)"
              aria-label="Commands ⌘K"
            >
              <Command className="w-3.5 h-3.5" aria-hidden="true" />
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

        {banner && <div className="shrink-0">{banner}</div>}

        {/* Page Content */}
        <div id="main-content" ref={mainContentRef} className="min-h-0 flex-1 overflow-auto">
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
