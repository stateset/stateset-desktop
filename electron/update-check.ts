export type UpdateLifecycleState =
  'idle' | 'current' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled';

export interface UpdateStatusSnapshot {
  status: UpdateLifecycleState;
  checking: boolean;
  available: boolean;
  progress: number;
  version?: string;
  error?: string;
  message?: string;
}

interface UpdateCheckResult {
  isUpdateAvailable: boolean;
  updateInfo: { version: string };
}

interface UpdateCheckResponse {
  available: boolean;
  version?: string;
  error?: string;
  message?: string;
  snapshot: UpdateStatusSnapshot;
}

interface UpdateState {
  get: () => UpdateStatusSnapshot;
  set: (snapshot: Partial<UpdateStatusSnapshot>) => void;
}

export async function checkForDesktopUpdates(
  updater: { checkForUpdates: () => Promise<UpdateCheckResult | null> },
  state: UpdateState
): Promise<UpdateCheckResponse> {
  // A downloaded or in-flight update already has a useful outcome. Rechecking
  // must not erase its version, progress or restart action.
  if (!['available', 'downloading', 'ready'].includes(state.get().status)) {
    state.set({
      status: 'checking',
      checking: true,
      available: false,
      progress: 0,
      version: undefined,
      error: undefined,
      message: undefined,
    });
    try {
      const result = await updater.checkForUpdates();
      // Native events can advance the download before the check promise settles.
      // They are authoritative; only supply an outcome while still checking.
      if (state.get().status === 'checking') {
        if (
          !result ||
          typeof result.isUpdateAvailable !== 'boolean' ||
          (result.isUpdateAvailable && !result.updateInfo?.version)
        ) {
          throw new Error('The update service returned no usable result. Try again.');
        }
        state.set({
          status: result.isUpdateAvailable ? 'available' : 'current',
          checking: false,
          available: result.isUpdateAvailable,
          progress: 0,
          version: result.isUpdateAvailable ? result.updateInfo.version : undefined,
        });
      }
    } catch (error) {
      if (state.get().status === 'checking') {
        state.set({
          status: 'error',
          checking: false,
          available: false,
          progress: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const snapshot = { ...state.get() };
  if (snapshot.status === 'error') {
    return {
      available: false,
      error: snapshot.error || 'Update check failed. Try again.',
      snapshot,
    };
  }
  if (snapshot.status === 'disabled') {
    return {
      available: false,
      message: snapshot.message || 'Updates are disabled in this build.',
      snapshot,
    };
  }
  if (snapshot.available) return { available: true, version: snapshot.version, snapshot };
  return { available: false, snapshot };
}
