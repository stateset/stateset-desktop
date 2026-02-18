/**
 * UI Configuration
 * Centralized configuration for UI-related settings
 */

export const UI_CONFIG = {
  /** Polling intervals (in milliseconds) */
  polling: {
    /** Dashboard session list refresh interval */
    sessionList: 5000,
    /** API health check interval */
    healthCheck: 5000,
    /** Online status check interval */
    onlineStatus: 30000,
    /** Background agents check interval */
    backgroundAgents: 5000,
  },

  /** Pagination settings */
  pagination: {
    /** Default items per page */
    defaultPageSize: 10,
    /** Available page size options */
    pageSizeOptions: [10, 25, 50, 100] as const,
    /** Maximum page buttons to show */
    maxVisiblePages: 5,
  },

  /** Toast notification settings */
  toast: {
    /** Default duration in milliseconds */
    defaultDuration: 5000,
    /** Maximum number of visible toasts */
    maxVisible: 5,
    /** Duration for error toasts (longer for readability) */
    errorDuration: 7000,
    /** Duration for success toasts */
    successDuration: 3000,
  },

  /** Animation settings */
  animation: {
    /** Page transition duration */
    pageTransition: 200,
    /** Modal fade duration */
    modalFade: 150,
    /** Toast slide duration */
    toastSlide: 300,
    /** Skeleton pulse duration */
    skeletonPulse: 1500,
  },

  /** Auto-scroll settings */
  autoScroll: {
    /** Distance from bottom to trigger auto-scroll (px) */
    threshold: 120,
  },

  /** Keyboard shortcuts */
  shortcuts: {
    /** Open command palette */
    commandPalette: 'Ctrl/Cmd+K',
    /** Create new agent */
    newAgent: 'Ctrl/Cmd+N',
    /** Refresh data */
    refresh: 'Ctrl/Cmd+R',
    /** Focus search */
    search: '/',
    /** Show keyboard shortcuts */
    showShortcuts: '?',
  },
} as const;

export type UiConfig = typeof UI_CONFIG;
