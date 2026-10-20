import type { PlatformConnection } from '../types';
import { getErrorMessage } from './errors';
import type { McpProbeResult } from '../vite-env';

type StoredSecret = {
  credentials: Record<string, string>;
  updated_at: string;
};

type LocalSecretsState = Record<string, Record<string, Record<string, StoredSecret>>>;
let fallbackState: LocalSecretsState | null = null;
let mutationQueue: Promise<void> = Promise.resolve();

// Read the latest committed vault inside each mutation, so overlapping brand
// saves and removals cannot overwrite one another's credentials.
function mutateVault(write: () => Promise<void>): Promise<void> {
  const task = mutationQueue.then(write, write);
  mutationQueue = task.catch(() => undefined);
  return task;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readStorage = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  if (window.electronAPI?.secrets?.getLocal) {
    const payload = await window.electronAPI.secrets.getLocal();
    return typeof payload === 'string' ? payload : null;
  }
  if (fallbackState) {
    try {
      return JSON.stringify(fallbackState);
    } catch {
      fallbackState = null;
    }
  }

  return null;
};

const writeStorage = async (payload: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (window.electronAPI?.secrets?.setLocal) {
    const confirmed = await window.electronAPI.secrets.setLocal(payload);
    if (confirmed !== true) throw new Error('Credential storage did not confirm the save.');
    return;
  }
  try {
    fallbackState = JSON.parse(payload) as LocalSecretsState;
  } catch {
    fallbackState = null;
  }
};

const clearStorage = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (window.electronAPI?.secrets?.clearLocal) {
    const confirmed = await window.electronAPI.secrets.clearLocal();
    if (confirmed !== true) throw new Error('Credential storage did not confirm the removal.');
    return;
  }
  fallbackState = null;
};

const readState = async (): Promise<LocalSecretsState> => {
  const raw = await readStorage();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }
    return parsed as LocalSecretsState;
  } catch {
    return {};
  }
};

const writeState = async (state: LocalSecretsState): Promise<void> => {
  await writeStorage(JSON.stringify(state));
};

const ensureBrandState = (
  state: LocalSecretsState,
  tenantId: string,
  brandId: string
): Record<string, StoredSecret> => {
  if (!state[tenantId]) {
    state[tenantId] = {};
  }
  if (!state[tenantId][brandId]) {
    state[tenantId][brandId] = {};
  }
  return state[tenantId][brandId];
};

/** Only an http(s) endpoint can be probed; the custom-server field also accepts a local command. */
function isProbableEndpoint(endpoint: string | undefined): endpoint is string {
  return typeof endpoint === 'string' && /^https?:\/\//i.test(endpoint.trim());
}

export const localSecretsApi = {
  getCredentials: async (
    tenantId: string,
    brandId: string,
    platform: string
  ): Promise<Record<string, string> | null> => {
    const state = await readState();
    return state[tenantId]?.[brandId]?.[platform]?.credentials ?? null;
  },
  listConnections: async (tenantId: string, brandId: string): Promise<PlatformConnection[]> => {
    const state = await readState();
    const brandState = state[tenantId]?.[brandId] ?? {};
    return Object.keys(brandState).map((platform) => ({
      platform,
      connected: true,
      fields: Object.keys(brandState[platform]?.credentials ?? {}),
    }));
  },

  storeCredentials: (
    tenantId: string,
    brandId: string,
    platform: string,
    credentials: Record<string, string>
  ): Promise<void> => {
    const snapshot = { ...credentials };
    return mutateVault(async () => {
      const state = await readState();
      const brandState = ensureBrandState(state, tenantId, brandId);
      brandState[platform] = {
        credentials: snapshot,
        updated_at: new Date().toISOString(),
      };
      await writeState(state);
    });
  },

  /**
   * Verifies a locally stored connection. MCP servers get a real handshake
   * against their endpoint; anything else can only be reported as stored,
   * since testing those needs the server-side vault.
   */
  testConnection: async (
    tenantId: string,
    brandId: string,
    platform: string
  ): Promise<{ success: boolean; message: string; tested?: boolean; probe?: McpProbeResult }> => {
    const state = await readState();
    const stored = state[tenantId]?.[brandId]?.[platform];
    if (!stored) {
      return {
        success: false,
        message: 'No credentials are stored on this device for that server.',
      };
    }

    const endpoint = stored.credentials?.endpoint;
    if (!endpoint) {
      return {
        success: true,
        tested: false,
        message: 'Credentials are stored locally. This platform has no MCP endpoint to test.',
      };
    }

    // The custom-server field accepts a URL or a local command; a command runs
    // as a stdio process, which this app cannot reach.
    if (!isProbableEndpoint(endpoint)) {
      return {
        success: true,
        tested: false,
        message: 'Stored locally. This is a local command, which cannot be tested from here.',
      };
    }

    const probe = typeof window !== 'undefined' ? window.electronAPI?.mcp?.probe : undefined;
    if (!probe) {
      return {
        success: true,
        tested: false,
        message: 'Credentials are stored locally. Testing is only available in the desktop app.',
      };
    }

    try {
      const authToken = stored.credentials?.auth_token;
      const result = await probe(authToken ? { endpoint, authToken } : { endpoint });
      return result.ok
        ? {
            success: true,
            tested: true,
            message: `${result.serverName} ${result.serverVersion} · ${result.toolCount} ${
              result.toolCount === 1 ? 'tool' : 'tools'
            }`,
            probe: result,
          }
        : { success: false, tested: true, message: result.error, probe: result };
    } catch (error) {
      // The probe itself failed, so the server was never reached.
      return {
        success: false,
        tested: true,
        message: getErrorMessage(error),
        probe: { ok: false, error: getErrorMessage(error), unreachable: true },
      };
    }
  },

  /** Locally stored connections that expose an MCP endpoint, for bulk verification. */
  listMcpEndpoints: async (
    tenantId: string,
    brandId: string
  ): Promise<{ platform: string; endpoint: string; authToken?: string }[]> => {
    const state = await readState();
    const brandState = state[tenantId]?.[brandId] ?? {};

    return Object.entries(brandState)
      .filter(([, stored]) => isProbableEndpoint(stored?.credentials?.endpoint))
      .map(([platform, stored]) => ({
        platform,
        endpoint: stored.credentials.endpoint,
        authToken: stored.credentials.auth_token,
      }));
  },

  deleteCredentials: (tenantId: string, brandId: string, platform: string): Promise<void> =>
    mutateVault(async () => {
      const state = await readState();
      if (!state[tenantId]?.[brandId]?.[platform]) {
        return;
      }
      delete state[tenantId][brandId][platform];

      if (Object.keys(state[tenantId][brandId]).length === 0) {
        delete state[tenantId][brandId];
      }
      if (Object.keys(state[tenantId]).length === 0) {
        delete state[tenantId];
      }

      if (Object.keys(state).length === 0) {
        await clearStorage();
        return;
      }
      await writeState(state);
    }),
};
