/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderWithProviders,
  mockElectronAPI,
  screen,
  fireEvent,
  waitFor,
} from '../../../test-utils';
import { usePreferencesStore } from '../../../stores/preferences';
import { NotificationSettings } from './NotificationSettings';

describe('NotificationSettings', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    electronAPI = mockElectronAPI();
    usePreferencesStore.setState({
      desktopNotifications: true,
      soundAlerts: true,
      telemetryEnabled: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders notification and privacy sections', () => {
    renderWithProviders(<NotificationSettings />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText(/We never collect API keys/)).toBeInTheDocument();
  });

  it('reflects store values in the toggles', () => {
    usePreferencesStore.setState({ desktopNotifications: false, soundAlerts: true });
    renderWithProviders(<NotificationSettings />);

    expect(screen.getByRole('checkbox', { name: 'Desktop Notifications' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sound Alerts' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Share anonymous usage data' })).not.toBeChecked();
  });

  it('toggles desktop notifications and persists the change', async () => {
    renderWithProviders(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Desktop Notifications' }));

    expect(usePreferencesStore.getState().desktopNotifications).toBe(false);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('desktopNotifications', false);
    });
  });

  it('toggles sound alerts and persists the change', async () => {
    renderWithProviders(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sound Alerts' }));

    expect(usePreferencesStore.getState().soundAlerts).toBe(false);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('soundAlerts', false);
    });
  });

  it('toggles telemetry opt-in and persists the change', async () => {
    renderWithProviders(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Share anonymous usage data' }));

    expect(usePreferencesStore.getState().telemetryEnabled).toBe(true);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('telemetryEnabled', true);
    });
  });

  it('plays a test sound through the Audio API', () => {
    const oscillator = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
    const gainNode = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return oscillator;
      }
      createGain() {
        return gainNode;
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);

    renderWithProviders(<NotificationSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Play test notification sound' }));

    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
    expect(oscillator.connect).toHaveBeenCalledWith(gainNode);
  });

  it('does not crash when the Audio API is unavailable', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('not supported');
        }
      }
    );

    renderWithProviders(<NotificationSettings />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Play test notification sound' }))
    ).not.toThrow();
  });
});
