/**
 * Check whether the Electron preload API is available.
 * Consolidates the various `typeof window.electronAPI !== 'undefined'`
 * and `typeof window === 'undefined' || !window.electronAPI` guards
 * scattered across the codebase.
 */
export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}
