import { isElectronAvailable } from './electron';

export function shouldUseHashRouting(
  electronRuntime: boolean = isElectronAvailable(),
  protocol: string = typeof window !== 'undefined' ? window.location.protocol : ''
): boolean {
  return electronRuntime && protocol === 'file:';
}
