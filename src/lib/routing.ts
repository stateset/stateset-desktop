import { isElectronAvailable } from './electron';

export function shouldUseHashRouting(
  electronRuntime: boolean = isElectronAvailable(),
  protocol: string = typeof window !== 'undefined' ? window.location.protocol : ''
): boolean {
  return electronRuntime && protocol === 'file:';
}

/** A top-level recovery has no router context; keep packaged navigation on its renderer file. */
export function dashboardLocation(currentUrl: string): string {
  const destination = new URL(currentUrl);
  if (destination.protocol === 'file:') {
    destination.hash = '/';
    return destination.href;
  }
  return new URL('/', destination).href;
}
