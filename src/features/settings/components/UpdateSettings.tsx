import { APP_VERSION } from '../../../lib/appVersion';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, RefreshCw, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';
import { isElectronAvailable } from '../../../lib/electron';

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

type UpdateStatus =
  'idle' | 'current' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled';

interface UpdateStatusSnapshot {
  status: UpdateStatus;
  checking: boolean;
  available: boolean;
  progress: number;
  version?: string;
  error?: string;
  message?: string;
}

export function UpdateSettings({ appVersion }: { appVersion: string }) {
  const desktopAvailable = isElectronAvailable();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(
    desktopAvailable ? 'idle' : 'disabled'
  );
  const revision = useRef(0);
  const mounted = useRef(false);
  const checkPending = useRef(false);
  const installPending = useRef(false);
  const [installing, setInstalling] = useState(false);
  const [installationError, setInstallationError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [downloadTransferred, setDownloadTransferred] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(
    desktopAvailable ? null : 'Updates are available in the installed desktop app.'
  );

  const applyUpdateStatusSnapshot = useCallback((snapshot: UpdateStatusSnapshot) => {
    setUpdateStatus(snapshot.status);
    setDownloadProgress(snapshot.progress || 0);

    if (snapshot.version) {
      setUpdateInfo({ version: snapshot.version });
    } else if (
      snapshot.status === 'idle' ||
      snapshot.status === 'current' ||
      snapshot.status === 'disabled'
    ) {
      setUpdateInfo(null);
    }

    if (snapshot.error) {
      setUpdateError(snapshot.error);
      return;
    }
    if (snapshot.status === 'disabled' && snapshot.message) {
      setUpdateError(snapshot.message);
      return;
    }
    setUpdateError(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!isElectronAvailable())
      return () => {
        mounted.current = false;
      };
    const app = window.electronAPI!.app;
    let active = true;
    const initialRevision = revision.current;
    const observe = () => {
      revision.current++;
      setUpdateError(null);
      setInstallationError(null);
    };
    const unsubscribers = [
      app.onUpdateChecking(() => {
        if (!active) return;
        observe();
        setUpdateStatus('checking');
      }),
      app.onUpdateAvailable((info: UpdateInfo) => {
        if (!active) return;
        observe();
        setUpdateStatus('available');
        setUpdateInfo(info);
      }),
      app.onUpdateNotAvailable(() => {
        if (!active) return;
        observe();
        setUpdateStatus('current');
        setUpdateInfo(null);
      }),
      app.onUpdateProgress((progress: UpdateProgress) => {
        if (!active) return;
        observe();
        setUpdateStatus('downloading');
        setDownloadProgress(Math.max(0, Math.min(100, progress.percent)));
        setDownloadSpeed(progress.bytesPerSecond);
        setDownloadTotal(progress.total);
        setDownloadTransferred(progress.transferred);
      }),
      app.onUpdateDownloaded((info: UpdateInfo) => {
        if (!active) return;
        observe();
        setUpdateStatus('ready');
        setUpdateInfo(info);
      }),
      app.onUpdateError((error: string) => {
        if (!active) return;
        observe();
        setUpdateStatus('error');
        setUpdateError(error);
      }),
    ];
    void app
      .getUpdateStatus()
      .then((snapshot) => {
        if (active && revision.current === initialRevision) applyUpdateStatusSnapshot(snapshot);
      })
      .catch(() => {
        if (active && revision.current === initialRevision) {
          setUpdateStatus('error');
          setUpdateError('Unable to read update status. Try checking again.');
        }
      });
    return () => {
      active = false;
      mounted.current = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyUpdateStatusSnapshot]);

  const checkForUpdates = async () => {
    if (!isElectronAvailable() || checkPending.current) return;
    checkPending.current = true;
    const requestRevision = ++revision.current;
    setUpdateStatus('checking');
    setUpdateError(null);
    setInstallationError(null);
    try {
      const result = await window.electronAPI!.app.checkForUpdates();
      if (!mounted.current || revision.current !== requestRevision) return;
      // A check can reuse an already downloaded update without emitting another
      // native event. Preserve its restart action and progress from the snapshot.
      applyUpdateStatusSnapshot(result.snapshot);
    } catch {
      if (mounted.current && revision.current === requestRevision) {
        setUpdateStatus('error');
        setUpdateError('Unable to check for updates. Please try again.');
      }
    } finally {
      checkPending.current = false;
    }
  };

  const installUpdate = async () => {
    if (!isElectronAvailable() || installPending.current) return;
    installPending.current = true;
    setInstalling(true);
    setInstallationError(null);
    try {
      const accepted = await window.electronAPI!.app.installUpdate();
      if (!accepted && mounted.current)
        setInstallationError('Unable to restart for the update. Please try again.');
    } catch {
      if (mounted.current)
        setInstallationError('Unable to restart for the update. Please try again.');
    } finally {
      installPending.current = false;
      if (mounted.current) setInstalling(false);
    }
  };

  const getUpdateStatusDisplay = () => {
    switch (updateStatus) {
      case 'checking':
        return (
          <span className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Checking for updates...
          </span>
        );
      case 'available':
        return (
          <span className="flex items-center gap-2 text-[color:var(--ui-link)]">
            <Download className="w-4 h-4" aria-hidden="true" />
            Version {updateInfo?.version} available, downloading...
          </span>
        );
      case 'downloading':
        return (
          <span className="flex items-center gap-2 text-[color:var(--ui-link)]">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Downloading... {downloadProgress.toFixed(0)}%
            {downloadSpeed > 0 && (
              <span className="text-[color:var(--ui-muted)] text-xs ml-1">
                ({(downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s)
              </span>
            )}
          </span>
        );
      case 'ready':
        return (
          <span className="flex items-center gap-2 text-[color:var(--ui-positive)]">
            <Check className="w-4 h-4" aria-hidden="true" />
            Version {updateInfo?.version} ready to install
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-2 text-[color:var(--ui-negative)]">
            {updateError || 'Update check failed'}
          </span>
        );
      case 'disabled':
        return (
          <span className="flex items-center gap-2 text-gray-400">
            {updateError || 'Updates are disabled in this build'}
          </span>
        );
      case 'current':
        return <span className="text-gray-400">You're on the latest version</span>;
      default:
        return (
          <span className="text-gray-400">
            Check for updates to see if a newer version is available.
          </span>
        );
    }
  };

  return (
    <section
      aria-labelledby="update-settings-heading"
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'var(--ui-surface)',
        borderColor: 'var(--ui-border)',
        color: 'var(--ui-text)',
      }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--ui-border)' }}>
        <h2 id="update-settings-heading" className="font-semibold flex items-center gap-2.5">
          <Download className="w-5 h-5 text-gray-400" />
          Updates
        </h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Current Version</p>
            <p className="text-sm text-gray-400 break-all">{appVersion || APP_VERSION}</p>
          </div>
          <div className="flex items-center gap-2">
            {updateStatus === 'ready' ? (
              <button
                type="button"
                onClick={installUpdate}
                disabled={installing}
                className="ui-button ui-button-primary px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                {installing ? 'Restarting...' : 'Restart to Update'}
              </button>
            ) : (
              <button
                type="button"
                onClick={checkForUpdates}
                disabled={['checking', 'available', 'downloading', 'disabled'].includes(
                  updateStatus
                )}
                className="ui-button ui-button-secondary px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <RefreshCw
                  className={clsx('w-4 h-4', updateStatus === 'checking' && 'animate-spin')}
                  aria-hidden="true"
                />
                Check for Updates
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-gray-800" role="status" aria-live="polite">
          {getUpdateStatusDisplay()}
          {updateStatus === 'downloading' && (
            <>
              <div
                role="progressbar"
                aria-label="Update download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={downloadProgress}
                className="mt-2 w-full bg-gray-800 rounded-full h-2 overflow-hidden"
              >
                <div
                  className="bg-brand-600 h-2 rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              {downloadTotal > 0 && (
                <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                  {(downloadTransferred / (1024 * 1024)).toFixed(1)} /{' '}
                  {(downloadTotal / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </>
          )}
          {installationError && (
            <p role="alert" className="text-sm text-[color:var(--ui-negative)] mt-1">
              {installationError}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500">
          StateSet automatically checks for updates and downloads them in the background when
          supported for your build. Updates are installed when you restart the app.
        </p>
      </div>
    </section>
  );
}
