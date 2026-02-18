import { create } from 'zustand';
import { getTelemetry } from '../lib/telemetry';

export type ThemePreference = 'dark' | 'light';
export type AccentColor = 'blue' | 'purple' | 'green' | 'amber' | 'rose' | 'cyan';
export type RefreshInterval = 5000 | 10000 | 30000 | 60000;
export type PageSize = 10 | 25 | 50 | 100;

const ACCENT_COLORS: Set<string> = new Set(['blue', 'purple', 'green', 'amber', 'rose', 'cyan']);

interface PreferencesState {
  initialized: boolean;
  // Appearance
  theme: ThemePreference;
  accentColor: AccentColor;
  reduceMotion: boolean;
  compactMode: boolean;
  // Privacy
  telemetryEnabled: boolean;
  // Behavior
  minimizeToTray: boolean;
  autoStartAgentsOnLaunch: boolean;
  // Notifications
  desktopNotifications: boolean;
  soundAlerts: boolean;
  // Data refresh
  refreshInterval: RefreshInterval;
  // Display
  pageSize: PageSize;

  initialize: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setAccentColor: (color: AccentColor) => Promise<void>;
  setReduceMotion: (enabled: boolean) => Promise<void>;
  setCompactMode: (enabled: boolean) => Promise<void>;
  setTelemetryEnabled: (enabled: boolean) => Promise<void>;
  setMinimizeToTray: (enabled: boolean) => Promise<void>;
  setAutoStartAgentsOnLaunch: (enabled: boolean) => Promise<void>;
  setDesktopNotifications: (enabled: boolean) => Promise<void>;
  setSoundAlerts: (enabled: boolean) => Promise<void>;
  setRefreshInterval: (interval: RefreshInterval) => Promise<void>;
  setPageSize: (size: PageSize) => Promise<void>;
}

const DEFAULTS = {
  theme: 'dark' as ThemePreference,
  accentColor: 'blue' as AccentColor,
  reduceMotion: false,
  compactMode: false,
  telemetryEnabled: false,
  minimizeToTray: true,
  autoStartAgentsOnLaunch: true,
  desktopNotifications: true,
  soundAlerts: true,
  refreshInterval: 5000 as RefreshInterval,
  pageSize: 10 as PageSize,
};

const applyTheme = (theme: ThemePreference) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
};

const applyAccentColor = (color: AccentColor) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.accent = color;
};

const applyReduceMotion = (enabled: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.reduceMotion = enabled ? 'true' : 'false';
};

const applyCompactMode = (enabled: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.compact = enabled ? 'true' : 'false';
};

applyTheme(DEFAULTS.theme);
applyAccentColor(DEFAULTS.accentColor);
applyReduceMotion(DEFAULTS.reduceMotion);
applyCompactMode(DEFAULTS.compactMode);

// Module-level guard against concurrent initialization
let _prefsInitializing = false;

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  initialized: false,
  ...DEFAULTS,

  initialize: async () => {
    if (get().initialized || _prefsInitializing) return;
    _prefsInitializing = true;
    if (typeof window === 'undefined' || !window.electronAPI) {
      applyTheme(get().theme);
      set({ initialized: true });
      return;
    }

    try {
      const [
        themeValue,
        accentColorValue,
        reduceMotion,
        compactMode,
        telemetryEnabledValue,
        minimizeToTray,
        autoStartAgentsOnLaunch,
        desktopNotifications,
        soundAlerts,
        refreshInterval,
        pageSize,
      ] = await Promise.all([
        window.electronAPI.store.get('theme'),
        window.electronAPI.store.get('accentColor'),
        window.electronAPI.store.get('reduceMotion'),
        window.electronAPI.store.get('compactMode'),
        window.electronAPI.store.get('telemetryEnabled'),
        window.electronAPI.store.get('minimizeToTray'),
        window.electronAPI.store.get('autoStartAgentsOnLaunch'),
        window.electronAPI.store.get('desktopNotifications'),
        window.electronAPI.store.get('soundAlerts'),
        window.electronAPI.store.get('refreshInterval'),
        window.electronAPI.store.get('pageSize'),
      ]);

      const theme = themeValue === 'light' ? 'light' : DEFAULTS.theme;
      const accentColor =
        typeof accentColorValue === 'string' && ACCENT_COLORS.has(accentColorValue)
          ? (accentColorValue as AccentColor)
          : DEFAULTS.accentColor;

      set({
        initialized: true,
        theme,
        accentColor,
        reduceMotion: typeof reduceMotion === 'boolean' ? reduceMotion : DEFAULTS.reduceMotion,
        compactMode: typeof compactMode === 'boolean' ? compactMode : DEFAULTS.compactMode,
        telemetryEnabled:
          typeof telemetryEnabledValue === 'boolean'
            ? telemetryEnabledValue
            : DEFAULTS.telemetryEnabled,
        minimizeToTray:
          typeof minimizeToTray === 'boolean' ? minimizeToTray : DEFAULTS.minimizeToTray,
        autoStartAgentsOnLaunch:
          typeof autoStartAgentsOnLaunch === 'boolean'
            ? autoStartAgentsOnLaunch
            : DEFAULTS.autoStartAgentsOnLaunch,
        desktopNotifications:
          typeof desktopNotifications === 'boolean'
            ? desktopNotifications
            : DEFAULTS.desktopNotifications,
        soundAlerts: typeof soundAlerts === 'boolean' ? soundAlerts : DEFAULTS.soundAlerts,
        refreshInterval:
          typeof refreshInterval === 'number'
            ? (refreshInterval as RefreshInterval)
            : DEFAULTS.refreshInterval,
        pageSize: typeof pageSize === 'number' ? (pageSize as PageSize) : DEFAULTS.pageSize,
      });

      applyTheme(theme);
      applyAccentColor(accentColor);
      applyReduceMotion(typeof reduceMotion === 'boolean' ? reduceMotion : DEFAULTS.reduceMotion);
      applyCompactMode(typeof compactMode === 'boolean' ? compactMode : DEFAULTS.compactMode);

      if (typeof telemetryEnabledValue === 'boolean') {
        const telemetry = getTelemetry();
        if (telemetryEnabledValue) {
          telemetry?.enable();
        } else {
          void telemetry?.disable();
        }
      }
    } catch {
      applyTheme(get().theme);
      applyAccentColor(get().accentColor);
      applyReduceMotion(get().reduceMotion);
      applyCompactMode(get().compactMode);
      set({ initialized: true });
    }
  },

  setTheme: async (theme) => {
    set({ theme });
    applyTheme(theme);
    if (window.electronAPI) {
      await window.electronAPI.store.set('theme', theme);
    }
  },

  setAccentColor: async (color) => {
    set({ accentColor: color });
    applyAccentColor(color);
    if (window.electronAPI) {
      await window.electronAPI.store.set('accentColor', color);
    }
  },

  setMinimizeToTray: async (enabled) => {
    set({ minimizeToTray: enabled });
    if (window.electronAPI) {
      await window.electronAPI.background.setMinimizeToTray(enabled);
    }
  },

  setDesktopNotifications: async (enabled) => {
    set({ desktopNotifications: enabled });
    if (window.electronAPI) {
      await window.electronAPI.store.set('desktopNotifications', enabled);
    }
  },

  setSoundAlerts: async (enabled) => {
    set({ soundAlerts: enabled });
    if (window.electronAPI) {
      await window.electronAPI.store.set('soundAlerts', enabled);
    }
  },

  setReduceMotion: async (enabled) => {
    set({ reduceMotion: enabled });
    applyReduceMotion(enabled);
    if (window.electronAPI) {
      await window.electronAPI.store.set('reduceMotion', enabled);
    }
  },

  setCompactMode: async (enabled) => {
    set({ compactMode: enabled });
    applyCompactMode(enabled);
    if (window.electronAPI) {
      await window.electronAPI.store.set('compactMode', enabled);
    }
  },

  setTelemetryEnabled: async (enabled) => {
    set({ telemetryEnabled: enabled });
    if (window.electronAPI) {
      await window.electronAPI.store.set('telemetryEnabled', enabled);
    }
    const telemetry = getTelemetry();
    if (enabled) {
      telemetry?.enable();
    } else {
      await telemetry?.disable();
    }
  },

  setAutoStartAgentsOnLaunch: async (enabled) => {
    set({ autoStartAgentsOnLaunch: enabled });
    if (window.electronAPI) {
      await window.electronAPI.store.set('autoStartAgentsOnLaunch', enabled);
    }
  },

  setRefreshInterval: async (interval) => {
    set({ refreshInterval: interval });
    if (window.electronAPI) {
      await window.electronAPI.store.set('refreshInterval', interval);
    }
  },

  setPageSize: async (size) => {
    set({ pageSize: size });
    if (window.electronAPI) {
      await window.electronAPI.store.set('pageSize', size);
    }
  },
}));
