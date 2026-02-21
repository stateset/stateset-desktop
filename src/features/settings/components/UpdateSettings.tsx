import { useState, useEffect } from 'react';
import { Download, RefreshCw, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';

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
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'disabled';

export function UpdateSettings({ appVersion }: { appVersion: string }) {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribers = [
      window.electronAPI.app.onUpdateChecking(() => {
        setUpdateStatus('checking');
        setUpdateError(null);
      }),
      window.electronAPI.app.onUpdateAvailable((info: UpdateInfo) => {
        setUpdateStatus('available');
        setUpdateInfo(info);
      }),
      window.electronAPI.app.onUpdateNotAvailable(() => {
        setUpdateStatus('idle');
      }),
      window.electronAPI.app.onUpdateProgress((progress: UpdateProgress) => {
        setUpdateStatus('downloading');
        setDownloadProgress(progress.percent);
      }),
      window.electronAPI.app.onUpdateDownloaded((info: UpdateInfo) => {
        setUpdateStatus('ready');
        setUpdateInfo(info);
      }),
      window.electronAPI.app.onUpdateError((error: string) => {
        setUpdateStatus('error');
        setUpdateError(error);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const checkForUpdates = async () => {
    if (window.electronAPI) {
      setUpdateStatus('checking');
      setUpdateError(null);
      const result = await window.electronAPI.app.checkForUpdates();
      if (result?.available === false) {
        if (result.message) {
          setUpdateStatus('disabled');
          setUpdateError(result.message);
          return;
        }
        if (result.error) {
          setUpdateStatus('error');
          setUpdateError(result.error);
          return;
        }
        setUpdateStatus('idle');
      }
    }
  };

  const installUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.app.installUpdate();
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
          <span className="flex items-center gap-2 text-blue-400">
            <Download className="w-4 h-4" aria-hidden="true" />
            Version {updateInfo?.version} available, downloading...
          </span>
        );
      case 'downloading':
        return (
          <span className="flex items-center gap-2 text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Downloading... {downloadProgress.toFixed(0)}%
          </span>
        );
      case 'ready':
        return (
          <span className="flex items-center gap-2 text-green-400">
            <Check className="w-4 h-4" aria-hidden="true" />
            Version {updateInfo?.version} ready to install
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-2 text-red-400">
            {updateError || 'Update check failed'}
          </span>
        );
      case 'disabled':
        return (
          <span className="flex items-center gap-2 text-gray-400">
            {updateError || 'Updates are disabled in this build'}
          </span>
        );
      default:
        return <span className="text-gray-400">You're on the latest version</span>;
    }
  };

  return (
    <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
        <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
          <Download className="w-5 h-5 text-gray-400" />
          Updates
        </h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Current Version</p>
            <p className="text-sm text-gray-400">{appVersion || '1.0.1'}</p>
          </div>
          <div className="flex items-center gap-2">
            {updateStatus === 'ready' ? (
              <button
                type="button"
                onClick={installUpdate}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40 focus-visible:ring-offset-1 rounded-lg transition-all duration-200 font-medium flex items-center gap-2 shadow-md shadow-green-500/25 hover:shadow-lg hover:shadow-green-500/30 animate-glow-pulse"
                style={{ color: 'rgb(74 222 128)' }}
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Restart to Update
              </button>
            ) : (
              <button
                type="button"
                onClick={checkForUpdates}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-lg transition-colors flex items-center gap-2"
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
            <div className="mt-2 w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full transition-all duration-300 relative"
                style={{ width: `${downloadProgress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
              </div>
            </div>
          )}
          {updateError && <p className="text-sm text-red-400 mt-1">{updateError}</p>}
        </div>

        <p className="text-xs text-gray-500">
          StateSet automatically checks for updates and downloads them in the background when
          supported for your build. Updates are installed when you restart the app.
        </p>
      </div>
    </section>
  );
}
