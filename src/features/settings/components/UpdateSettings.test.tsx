/** @vitest-environment happy-dom */
import { version as packageVersion } from '../../../../package.json';
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
    checkForUpdates: vi.fn().mockResolvedValue({
      available: false,
      snapshot: { ...IDLE_SNAPSHOT, status: 'current' },
    }),
    installUpdate: vi.fn().mockResolvedValue(true),
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
    expect(screen.queryByText("You're on the latest version")).not.toBeInTheDocument();
    await waitFor(() => expect(app.getUpdateStatus).toHaveBeenCalled());
  });

  it('falls back to the default version when appVersion is empty', () => {
    mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="" />);

    expect(screen.getByText(packageVersion)).toBeInTheDocument();
  });

  it('explains that update checks require the desktop app', () => {
    clearElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    expect(screen.queryByText("You're on the latest version")).not.toBeInTheDocument();
    expect(
      screen.getByText('Updates are available in the installed desktop app.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check for Updates/i })).toBeDisabled();
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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Restart to Update/i }));
    });
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
      snapshot: {
        ...IDLE_SNAPSHOT,
        status: 'disabled',
        message: 'Updates are disabled in development',
      },
    });
    renderWithProviders(<UpdateSettings appVersion="2.0.0" />);

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Updates are disabled in development').length).toBeGreaterThan(0);
    });
  });

  it('shows the error when the update check fails', async () => {
    const { app } = mockUpdateElectronAPI();
    app.checkForUpdates.mockResolvedValue({
      available: false,
      error: 'Network unreachable',
      snapshot: { ...IDLE_SNAPSHOT, status: 'error', error: 'Network unreachable' },
    });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('UpdateSettings recovery and event ordering', () => {
  it('only claims the latest version after a completed check snapshot', async () => {
    mockUpdateElectronAPI({ ...IDLE_SNAPSHOT, status: 'current' });
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    await waitFor(() =>
      expect(screen.getByText("You're on the latest version")).toBeInTheDocument()
    );
  });
  it('offers a recoverable error when the native status lookup fails', async () => {
    const { app } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockRejectedValue(new Error('IPC unavailable'));
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    await waitFor(() =>
      expect(
        screen.getByText('Unable to read update status. Try checking again.')
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("You're on the latest version")).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check for Updates/i })).toBeEnabled();
  });
  it('keeps the restart action when a manual check overtakes the initial ready snapshot', async () => {
    const initial = deferred<Record<string, unknown>>();
    const ready = {
      ...IDLE_SNAPSHOT,
      status: 'ready',
      available: true,
      progress: 100,
      version: '1.1.21',
    };
    const { app } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockReturnValue(initial.promise);
    app.checkForUpdates.mockResolvedValue({
      available: true,
      version: ready.version,
      snapshot: ready,
    });
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    expect(await screen.findByText('Version 1.1.21 ready to install')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart to Update/i })).toBeEnabled();
    await act(async () => initial.resolve(ready));
    expect(screen.getByRole('button', { name: /Restart to Update/i })).toBeEnabled();
    expect(screen.queryByText(/available, downloading/)).not.toBeInTheDocument();
  });
  it('recovers a ready download after the initial status lookup fails', async () => {
    const ready = {
      ...IDLE_SNAPSHOT,
      status: 'ready',
      available: true,
      progress: 100,
      version: '1.1.21',
    };
    const { app } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockRejectedValue(new Error('IPC unavailable'));
    app.checkForUpdates.mockResolvedValue({
      available: true,
      version: ready.version,
      snapshot: ready,
    });
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    expect(
      await screen.findByText('Unable to read update status. Try checking again.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    expect(await screen.findByText('Version 1.1.21 ready to install')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart to Update/i })).toBeEnabled();
    expect(screen.queryByText(/Unable to read update status/)).not.toBeInTheDocument();
  });
  it('catches rejected checks and allows a successful retry', async () => {
    const { app } = mockUpdateElectronAPI();
    app.checkForUpdates.mockRejectedValueOnce(new Error('IPC disconnected'));
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    await waitFor(() =>
      expect(screen.getByText('Unable to check for updates. Please try again.')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    await waitFor(() =>
      expect(screen.getByText("You're on the latest version")).toBeInTheDocument()
    );
    expect(app.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText('Unable to check for updates. Please try again.')
    ).not.toBeInTheDocument();
  });
  it('does not let an initial idle snapshot erase a downloaded event', async () => {
    const initial = deferred<Record<string, unknown>>();
    const { app, listeners } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockReturnValue(initial.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    act(() => listeners.downloaded!({ version: '1.1.21' }));
    await act(async () => initial.resolve(IDLE_SNAPSHOT));
    expect(screen.getByText('Version 1.1.21 ready to install')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart to Update/i })).toBeEnabled();
  });
  it('does not let an initial lookup failure erase a completed live check', async () => {
    const initial = deferred<Record<string, unknown>>();
    const { app, listeners } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockReturnValue(initial.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    act(() => listeners.notAvailable!());
    await act(async () => initial.reject(new Error('Old lookup failed')));
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
    expect(screen.queryByText(/Unable to read update status/)).not.toBeInTheDocument();
  });
  it('does not let a check response erase newer download progress', async () => {
    const result = deferred<{ available: boolean; snapshot: Record<string, unknown> }>();
    const { app, listeners } = mockUpdateElectronAPI();
    app.checkForUpdates.mockReturnValue(result.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    act(() => listeners.progress!({ percent: 62, bytesPerSecond: 0, total: 100, transferred: 62 }));
    await act(async () =>
      result.resolve({ available: false, snapshot: { ...IDLE_SNAPSHOT, status: 'current' } })
    );
    expect(screen.getByText('Downloading... 62%')).toBeInTheDocument();
    expect(screen.queryByText("You're on the latest version")).not.toBeInTheDocument();
  });
  it('does not let a rejected old check erase a ready update', async () => {
    const result = deferred<{ available: boolean; snapshot: Record<string, unknown> }>();
    const { app, listeners } = mockUpdateElectronAPI();
    app.checkForUpdates.mockReturnValue(result.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    act(() => listeners.downloaded!({ version: '1.1.21' }));
    await act(async () => result.reject(new Error('Late failure')));
    expect(screen.getByText('Version 1.1.21 ready to install')).toBeInTheDocument();
  });
  it('does not let a late initial snapshot overwrite a manual check outcome', async () => {
    const initial = deferred<Record<string, unknown>>();
    const { app } = mockUpdateElectronAPI();
    app.getUpdateStatus.mockReturnValue(initial.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/i }));
    await waitFor(() =>
      expect(screen.getByText("You're on the latest version")).toBeInTheDocument()
    );
    await act(async () => initial.resolve(IDLE_SNAPSHOT));
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
  });
  it('prevents repeated checks while a request is pending', async () => {
    const result = deferred<{ available: boolean; snapshot: Record<string, unknown> }>();
    const { app } = mockUpdateElectronAPI();
    app.checkForUpdates.mockReturnValue(result.promise);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    const button = screen.getByRole('button', { name: /Check for Updates/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(app.checkForUpdates).toHaveBeenCalledTimes(1);
    await act(async () =>
      result.resolve({ available: false, snapshot: { ...IDLE_SNAPSHOT, status: 'current' } })
    );
  });
  it('restores the restart action when installation is declined', async () => {
    const { app } = mockUpdateElectronAPI({ ...IDLE_SNAPSHOT, status: 'ready', version: '1.1.21' });
    app.installUpdate.mockResolvedValueOnce(false);
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(await screen.findByRole('button', { name: /Restart to Update/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to restart for the update. Please try again.'
    );
    expect(screen.getByRole('button', { name: /Restart to Update/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Restart to Update/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(app.installUpdate).toHaveBeenCalledTimes(2);
  });
  it('catches a rejected install request and keeps the ready update', async () => {
    const { app } = mockUpdateElectronAPI({ ...IDLE_SNAPSHOT, status: 'ready', version: '1.1.21' });
    app.installUpdate.mockRejectedValueOnce(new Error('IPC disconnected'));
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    fireEvent.click(await screen.findByRole('button', { name: /Restart to Update/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to restart for the update. Please try again.'
    );
    expect(screen.getByText('Version 1.1.21 ready to install')).toBeInTheDocument();
  });
  it('shows an error only once and clears it after a successful native event', async () => {
    const { listeners } = mockUpdateElectronAPI();
    renderWithProviders(<UpdateSettings appVersion="1.1.20" />);
    act(() => listeners.error!('Network unavailable'));
    expect(screen.getAllByText('Network unavailable')).toHaveLength(1);
    act(() => listeners.notAvailable!());
    expect(screen.queryByText('Network unavailable')).not.toBeInTheDocument();
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
  });
});
