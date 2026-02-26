import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePreferencesStore } from './preferences';

// Mock electron API
const mockElectronAPI = {
  store: {
    get: vi.fn(),
    set: vi.fn(),
  },
  background: {
    setMinimizeToTray: vi.fn(),
  },
};

vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
});

describe('usePreferencesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI.store.get.mockResolvedValue(undefined);
    usePreferencesStore.setState({
      initialized: false,
      theme: 'dark',
      accentColor: 'blue',
      reduceMotion: false,
      compactMode: false,
      telemetryEnabled: false,
      minimizeToTray: true,
      autoStartAgentsOnLaunch: true,
      desktopNotifications: true,
      soundAlerts: true,
      refreshInterval: 5000,
      pageSize: 10,
    });
    (window as unknown as { electronAPI?: unknown }).electronAPI = mockElectronAPI;
  });

  describe('initial state', () => {
    it('should have dark theme by default', () => {
      const state = usePreferencesStore.getState();
      expect(state.theme).toBe('dark');
    });

    it('should have notifications enabled by default', () => {
      const state = usePreferencesStore.getState();
      expect(state.desktopNotifications).toBe(true);
    });

    it('should have minimize to tray enabled by default', () => {
      const state = usePreferencesStore.getState();
      expect(state.minimizeToTray).toBe(true);
    });

    it('should have sound alerts enabled by default', () => {
      const state = usePreferencesStore.getState();
      expect(state.soundAlerts).toBe(true);
    });
  });

  describe('setTheme', () => {
    it('should set theme to light', async () => {
      const store = usePreferencesStore.getState();
      await store.setTheme('light');

      const newState = usePreferencesStore.getState();
      expect(newState.theme).toBe('light');
    });

    it('should set theme to dark', async () => {
      const store = usePreferencesStore.getState();
      await store.setTheme('light');
      await store.setTheme('dark');

      const newState = usePreferencesStore.getState();
      expect(newState.theme).toBe('dark');
    });

    it('should persist theme to electron store', async () => {
      const store = usePreferencesStore.getState();
      await store.setTheme('light');

      expect(mockElectronAPI.store.set).toHaveBeenCalledWith('theme', 'light');
    });
  });

  describe('initialize', () => {
    it('loads persisted preferences from electron store', async () => {
      const persistedValues: Record<string, unknown> = {
        theme: 'light',
        accentColor: 'green',
        reduceMotion: true,
        compactMode: true,
        telemetryEnabled: false,
        minimizeToTray: false,
        autoStartAgentsOnLaunch: false,
        desktopNotifications: false,
        soundAlerts: false,
        refreshInterval: 30000,
        pageSize: 25,
      };
      mockElectronAPI.store.get.mockImplementation((key: string) => {
        return Promise.resolve(persistedValues[key]);
      });

      await usePreferencesStore.getState().initialize();

      const state = usePreferencesStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.theme).toBe('light');
      expect(state.accentColor).toBe('green');
      expect(state.reduceMotion).toBe(true);
      expect(state.compactMode).toBe(true);
      expect(state.minimizeToTray).toBe(false);
      expect(state.autoStartAgentsOnLaunch).toBe(false);
      expect(state.desktopNotifications).toBe(false);
      expect(state.soundAlerts).toBe(false);
      expect(state.refreshInterval).toBe(30000);
      expect(state.pageSize).toBe(25);
    });

    it('initializes and can re-initialize in browser mode without electron', async () => {
      (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;

      await usePreferencesStore.getState().initialize();
      expect(usePreferencesStore.getState().initialized).toBe(true);

      usePreferencesStore.setState({
        initialized: false,
        theme: 'light',
        accentColor: 'green',
        reduceMotion: true,
        compactMode: true,
      });

      await usePreferencesStore.getState().initialize();

      expect(usePreferencesStore.getState().initialized).toBe(true);
      expect(usePreferencesStore.getState().theme).toBe('light');
      expect(usePreferencesStore.getState().accentColor).toBe('green');
      expect(usePreferencesStore.getState().reduceMotion).toBe(true);
      expect(usePreferencesStore.getState().compactMode).toBe(true);
    });
  });

  describe('setDesktopNotifications', () => {
    it('should enable desktop notifications', async () => {
      const store = usePreferencesStore.getState();
      await store.setDesktopNotifications(false);
      await store.setDesktopNotifications(true);

      const newState = usePreferencesStore.getState();
      expect(newState.desktopNotifications).toBe(true);
    });

    it('should disable desktop notifications', async () => {
      const store = usePreferencesStore.getState();
      await store.setDesktopNotifications(false);

      const newState = usePreferencesStore.getState();
      expect(newState.desktopNotifications).toBe(false);
    });
  });

  describe('setMinimizeToTray', () => {
    it('should toggle minimize to tray setting', async () => {
      const store = usePreferencesStore.getState();
      await store.setMinimizeToTray(false);

      const newState = usePreferencesStore.getState();
      expect(newState.minimizeToTray).toBe(false);
    });

    it('should call electron background API', async () => {
      const store = usePreferencesStore.getState();
      await store.setMinimizeToTray(false);

      expect(mockElectronAPI.background.setMinimizeToTray).toHaveBeenCalledWith(false);
    });
  });

  describe('setSoundAlerts', () => {
    it('should enable sound alerts', async () => {
      const store = usePreferencesStore.getState();
      await store.setSoundAlerts(true);

      const newState = usePreferencesStore.getState();
      expect(newState.soundAlerts).toBe(true);
    });

    it('should disable sound alerts', async () => {
      const store = usePreferencesStore.getState();
      await store.setSoundAlerts(false);

      const newState = usePreferencesStore.getState();
      expect(newState.soundAlerts).toBe(false);
    });
  });
});
