import type { PlatformConnection } from '../../types';
import type { Platform } from './platforms';

export type ConnectionInfo = PlatformConnection & { source: 'remote' | 'local' };

export type ConnectionsResult = {
  connections: ConnectionInfo[];
  mode: 'remote' | 'local';
  vaultError?: string;
};

export const CUSTOM_MCP_FIELDS: Platform['requiredFields'] = [
  { key: 'endpoint', label: 'MCP Endpoint / Command', type: 'text' },
  { key: 'auth_token', label: 'Auth Token (optional)', type: 'password', required: false },
];
