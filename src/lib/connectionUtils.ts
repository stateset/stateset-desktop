import type { ConnectionState } from '../components/ConnectionStatus';

/**
 * Helper to get connection state from various inputs
 */
export function getConnectionState(
  isConnected: boolean,
  isConnecting: boolean,
  hasError: boolean
): ConnectionState {
  if (hasError) return 'error';
  if (isConnecting) return 'connecting';
  if (isConnected) return 'connected';
  return 'disconnected';
}
