/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor, act } from '../../../test-utils';
import { UpdateSettings } from './UpdateSettings';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

interface Listeners {
  checking?: () => void;
  available?: (info: UpdateInfo) => void;
  notAvailable?: () => void;
  progress?: (progress: UpdateProgress) => void;
  downloaded?: (info: UpdateInfo) => void;
  error?: (error: string) => void;
}

const IDLE_SNAPSHOT = {
  status: 'idle',
  checking: false,
  available: false,
  progress: 0,
};

function mockUpdateElectronAPI(snapshot: Record<string, unknown> = IDLE_SNAPSHOT) {
  const listeners: Listeners = {};
  const unsubscribers = Array.from({ length: 6 }, () => vi.fn());

  const app = {
    getUpdateStatus: vi.fn().mockResolvedValue(snapshot),
    checkForUpdates: vi.fn().mockResolvedValue({ available: false }),
    installUpdate: vi.fn(),
    onUpdateChecking: vi.fn((cb: () => void) => {
      listeners.checking = cb;
      return unsubscribers[0];
    }),
    onUpdateAvailable: vi.fn((cb: (info: UpdateInfo) => void) => {
      listeners.available = cb;
      return unsubscribers[1];
    }),
    onUpdateNotAvailable: vi.fn((cb: () => void) => {
      listeners.notAvailable = cb;
      return unsubscribers[2];
    }),
    onUpdateProgress: vi.fn((cb: (progress: UpdateProgress) => void) => {
      listeners.progress = cb;
      return unsubscribers[3];
    }),
    onUpdateDownloaded: vi.fn((cb: (info: UpdateInfo) => void) => {
      listeners.downloaded = cb;
      return unsubscribers[4];
    }),
    onUpdateError: vi.fn((cb: (error: string) => void) => {
      listeners.error = cb;
      return unsubscribers[5];
    }),
  };

  Object.defineProperty(window, 'electronAPI', {
    value: { app },
    writable: true,
    configurable: true,
  });

  return { app, listeners, unsubscribers };
}

function clearElectronAPI() {
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe('UpdateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current version and idle status', async () => {
    const { app } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.3.4" />);

    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('2.3.4')).toBeInTheDocument();
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
    await waitFor(() => expect(app.getUpdateStatus).toHaveBeenCalled());
  });

  it('falls back to the default version when appVersion is empty', () => {
    mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="" />);

    expect(screen.getByText('1.0.1')).toBeInTheDocument();
  });

  it('renders without electron and ignores the check button', () => {
    clearElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }))
    ).not.toThrow();
  });

  it('applies a "ready" status snapshot and installs on restart click', async () => {
    const { app } = mockUpdateElectronAPI({
      status: 'ready',
      checking: false,
      available: true,
      progress: 100,
      version: '3.0.0',
    });
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    await waitFor(() => {
      expect(screen.getByText('Version 3.0.0 ready to install')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Restart to Update/i }));
    expect(app.installUpdate).toHaveBeenCalled();
  });

  it('checks for updates and returns to idle when none are available', async () => {
    const { app } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));

    await waitFor(() => {
      expect(app.checkForUpdates).toHaveBeenCalled();
      expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
    });
  });

  it('shows the disabled message when updates are disabled for the build', async () => {
    const { app } = mockUpdateElectronAPI();
    app.checkForUpdates.mockResolvedValue({
      available: false,
      message: 'Updates are disabled in development',
    });
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Updates are disabled in development').length).toBeGreaterThan(0);
    });
  });

  it('shows the error when the update check fails', async () => {
    const { app } = mockUpdateElectronAPI();
    app.checkForUpdates.mockResolvedValue({ available: false, error: 'Network unreachable' });
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Network unreachable').length).toBeGreaterThan(0);
    });
  });

  it('shows download progress from progress events', async () => {
    const { listeners } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);
    await waitFor(() => expect(listeners.progress).toBeDefined());

    act(() => {
      listeners.progress!({
        percent: 42.4,
        bytesPerSecond: 2 * 1024 * 1024,
        total: 100 * 1024 * 1024,
        transferred: 42 * 1024 * 1024,
      });
    });

    expect(screen.getByText(/Downloading\.\.\. 42%/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/42\.0 \/\s*100\.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check for Updates/i })).toBeDisabled();
  });

  it('transitions through checking, available, and downloaded events', async () => {
    const { listeners } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);
    await waitFor(() => expect(listeners.downloaded).toBeDefined());

    act(() => listeners.checking!());
    expect(screen.getByText('Checking for updates...')).toBeInTheDocument();

    act(() => listeners.available!({ version: '3.1.0' }));
    expect(screen.getByText('Version 3.1.0 available, downloading...')).toBeInTheDocument();

    act(() => listeners.downloaded!({ version: '3.1.0' }));
    expect(screen.getByText('Version 3.1.0 ready to install')).toBeInTheDocument();

    act(() => listeners.notAvailable!());
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
  });

  it('shows update errors from error events', async () => {
    const { listeners } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);
    await waitFor(() => expect(listeners.error).toBeDefined());

    act(() => listeners.error!('Signature verification failed'));

    expect(screen.getAllByText('Signature verification failed').length).toBeGreaterThan(0);
  });

  it('unsubscribes from all update events on unmount', async () => {
    const { listeners, unsubscribers } = mockUpdateElectronAPI();
    const { unmount } = renderWithProviders(<UpdateSettings appVersion="2.0.0" />);
    await waitFor(() => expect(listeners.error).toBeDefined());

    unmount();

    unsubscribers.forEach((unsubscribe) => {
      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
