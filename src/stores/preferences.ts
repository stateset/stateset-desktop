import { create } from 'zustand';
import {
  applyTelemetryConsent,
  restoreTelemetryConsent,
  saveTelemetryConsent,
} from '../lib/telemetry';
import { isElectronAvailable } from '../lib/electron';

export type ThemePreference = 'dark' | 'light';
export type AccentColor = 'blue' | 'purple' | 'green' | 'amber' | 'rose' | 'cyan';
export type RefreshInterval = 5000 | 10000 | 30000 | 60000;
export type PageSize = 10 | 25 | 50 | 100;

const ACCENT_COLORS: Set<string> = new Set(['blue', 'purple', 'green', 'amber', 'rose', 'cyan']);
const ALLOWED_REFRESH_INTERVALS = new Set<number>([5000, 10000, 30000, 60000]);
const ALLOWED_PAGE_SIZES = new Set<number>([10, 25, 50, 100]);

export type TogglePreference =
  | 'minimizeToTray'
  | 'autoStartAgentsOnLaunch'
  | 'desktopNotifications'
  | 'soundAlerts'
  | 'reduceMotion'
  | 'compactMode'
  | 'telemetryEnabled';
export interface PreferenceSave {
  pending: boolean;
  requested: boolean;
  error: 'save_failed' | 'session_only' | 'load_failed' | null;
}

interface PreferencesState {
  initialized: boolean;
  saves: Partial<Record<TogglePreference, PreferenceSave>>;
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
  reload: () => Promise<void>;
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

const isRefreshInterval = (value: unknown): value is RefreshInterval =>
  typeof value === 'number' && ALLOWED_REFRESH_INTERVALS.has(value);

const isPageSize = (value: unknown): value is PageSize =>
  typeof value === 'number' && ALLOWED_PAGE_SIZES.has(value);

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

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const queues = new Map<TogglePreference, Promise<void>>();
  const revisions: Record<string, number> = {};
  const acknowledged: Partial<Record<TogglePreference, boolean>> = {};
  const touch = (key: string) => (revisions[key] = (revisions[key] ?? 0) + 1);
  const apply = (key: TogglePreference, value: boolean) => {
    set({ [key]: value } as Partial<PreferencesState>);
    if (key === 'reduceMotion') applyReduceMotion(value);
    if (key === 'compactMode') applyCompactMode(value);
  };
  const metadata = (key: TogglePreference, value: PreferenceSave) => {
    set((state) => ({ saves: { ...state.saves, [key]: value } }));
  };
  const save = (key: TogglePreference, value: boolean): Promise<void> => {
    if (typeof value !== 'boolean') return Promise.resolve();
    const previous = queues.get(key);
    if (!previous) acknowledged[key] = get()[key];
    const revision = touch(key);
    metadata(key, { pending: true, requested: value, error: null });
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    // Opt-out and pending opt-in both hold collection off until a current opt-in is acknowledged.
    if (key === 'telemetryEnabled') {
      apply('telemetryEnabled', false);
      applyTelemetryConsent(false);
    }
    // Consent writes also serialize with the collector's compatibility API.
    const consent =
      key === 'telemetryEnabled'
        ? saveTelemetryConsent(value).then(
            () => true,
            () => false
          )
        : undefined;
    const task: Promise<void> = (previous ?? Promise.resolve()).then(async () => {
      try {
        const accepted = consent
          ? await consent
          : !api
            ? true
            : key === 'minimizeToTray'
              ? await api.background.setMinimizeToTray(value)
              : await api.store.set(key, value);
        if (accepted !== true) throw new Error('Preference save was not acknowledged');
        acknowledged[key] = value;
        if (revisions[key] === revision) {
          apply(key, value);
          if (key === 'telemetryEnabled') applyTelemetryConsent(value);
          metadata(key, { pending: false, requested: value, error: null });
        }
      } catch {
        if (revisions[key] === revision) {
          apply(key, key === 'telemetryEnabled' ? false : (acknowledged[key] ?? get()[key]));
          metadata(key, {
            pending: false,
            requested: value,
            error: key === 'telemetryEnabled' ? 'session_only' : 'save_failed',
          });
        }
      } finally {
        if (queues.get(key) === task) queues.delete(key);
      }
    });
    queues.set(key, task);
    return task;
  };
  return {
    initialized: false,
    saves: {},
    ...DEFAULTS,

    reload: async () => {
      if (_prefsInitializing) return;
      set({ initialized: false });
      await get().initialize();
    },

    initialize: async () => {
      if (get().initialized || _prefsInitializing) return;
      _prefsInitializing = true;
      const started = { ...revisions };
      const pendingAtStart = new Set(queues.keys());

      try {
        if (!isElectronAvailable()) {
          const state = get();
          applyTheme(state.theme);
          applyAccentColor(state.accentColor);
          applyReduceMotion(state.reduceMotion);
          applyCompactMode(state.compactMode);
          set({ initialized: true });
          return;
        }

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
          window.electronAPI!.store.get('theme'),
          window.electronAPI!.store.get('accentColor'),
          window.electronAPI!.store.get('reduceMotion'),
          window.electronAPI!.store.get('compactMode'),
          window.electronAPI!.store.get('telemetryEnabled'),
          window.electronAPI!.store.get('minimizeToTray'),
          window.electronAPI!.store.get('autoStartAgentsOnLaunch'),
          window.electronAPI!.store.get('desktopNotifications'),
          window.electronAPI!.store.get('soundAlerts'),
          window.electronAPI!.store.get('refreshInterval'),
          window.electronAPI!.store.get('pageSize'),
        ]);

        const theme = themeValue === 'light' ? 'light' : DEFAULTS.theme;
        const accentColor =
          typeof accentColorValue === 'string' && ACCENT_COLORS.has(accentColorValue)
            ? (accentColorValue as AccentColor)
            : DEFAULTS.accentColor;

        const safeRefreshInterval = isRefreshInterval(refreshInterval)
          ? refreshInterval
          : DEFAULTS.refreshInterval;
        const safePageSize = isPageSize(pageSize) ? pageSize : DEFAULTS.pageSize;

        const hydrated: Partial<PreferencesState> = {
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
          refreshInterval: safeRefreshInterval,
          pageSize: safePageSize,
        };
        for (const key of Object.keys(hydrated)) {
          if (pendingAtStart.has(key as TogglePreference) || revisions[key] !== started[key])
            delete hydrated[key as keyof PreferencesState];
        }
        for (const key of [
          'minimizeToTray',
          'autoStartAgentsOnLaunch',
          'desktopNotifications',
          'soundAlerts',
          'reduceMotion',
          'compactMode',
          'telemetryEnabled',
        ] as const) {
          if (typeof hydrated[key] === 'boolean' && get().saves[key]?.error === 'load_failed') {
            metadata(key, { pending: false, requested: hydrated[key]!, error: null });
          }
        }
        if (typeof hydrated.telemetryEnabled === 'boolean') {
          const storedConsent = hydrated.telemetryEnabled;
          hydrated.telemetryEnabled = restoreTelemetryConsent(storedConsent);
          if (
            storedConsent &&
            !hydrated.telemetryEnabled &&
            !get().saves.telemetryEnabled?.pending
          ) {
            metadata('telemetryEnabled', {
              pending: false,
              requested: false,
              error: 'session_only',
            });
          }
        }
        set({ ...hydrated, initialized: true });
        applyTheme(get().theme);
        applyAccentColor(get().accentColor);
        applyReduceMotion(get().reduceMotion);
        applyCompactMode(get().compactMode);
      } catch {
        applyTheme(get().theme);
        applyAccentColor(get().accentColor);
        applyReduceMotion(get().reduceMotion);
        applyCompactMode(get().compactMode);
        for (const key of [
          'minimizeToTray',
          'autoStartAgentsOnLaunch',
          'desktopNotifications',
          'soundAlerts',
          'reduceMotion',
          'compactMode',
          'telemetryEnabled',
        ] as const) {
          if (pendingAtStart.has(key) || revisions[key] !== started[key]) continue;
          if (key === 'telemetryEnabled') {
            applyTelemetryConsent(false);
            apply(key, false);
          }
          metadata(key, { pending: false, requested: get()[key], error: 'load_failed' });
        }
        set({ initialized: true });
      } finally {
        _prefsInitializing = false;
      }
    },

    setTheme: async (theme) => {
      touch('theme');
      set({ theme });
      applyTheme(theme);
      if (window.electronAPI) {
        await window.electronAPI.store.set('theme', theme);
      }
    },

    setAccentColor: async (color) => {
      touch('accentColor');
      set({ accentColor: color });
      applyAccentColor(color);
      if (window.electronAPI) {
        await window.electronAPI.store.set('accentColor', color);
      }
    },

    setMinimizeToTray: (enabled) => save('minimizeToTray', enabled),

    setDesktopNotifications: (enabled) => save('desktopNotifications', enabled),

    setSoundAlerts: (enabled) => save('soundAlerts', enabled),

    setReduceMotion: (enabled) => save('reduceMotion', enabled),

    setCompactMode: (enabled) => save('compactMode', enabled),

    setTelemetryEnabled: (enabled) => save('telemetryEnabled', enabled),

    setAutoStartAgentsOnLaunch: (enabled) => save('autoStartAgentsOnLaunch', enabled),

    setRefreshInterval: async (interval) => {
      if (!isRefreshInterval(interval)) return;
      touch('refreshInterval');
      set({ refreshInterval: interval });
      if (window.electronAPI) {
        await window.electronAPI.store.set('refreshInterval', interval);
      }
    },

    setPageSize: async (size) => {
      if (!isPageSize(size)) return;
      touch('pageSize');
      set({ pageSize: size });
      if (window.electronAPI) {
        await window.electronAPI.store.set('pageSize', size);
      }
    },
  };
});
