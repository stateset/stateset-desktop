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
    usePreferencesStore.setState({
      initialized: false,
      theme: 'dark',
      minimizeToTray: true,
      desktopNotifications: true,
      soundAlerts: true,
    });
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
