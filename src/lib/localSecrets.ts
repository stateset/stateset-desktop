import type { PlatformConnection } from '../types';

type StoredSecret = {
  credentials: Record<string, string>;
  updated_at: string;
};

type LocalSecretsState = Record<string, Record<string, Record<string, StoredSecret>>>;
let fallbackState: LocalSecretsState | null = null;

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
    await window.electronAPI.secrets.setLocal(payload);
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
    await window.electronAPI.secrets.clearLocal();
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

export const localSecretsApi = {
  listConnections: async (tenantId: string, brandId: string): Promise<PlatformConnection[]> => {
    const state = await readState();
    const brandState = state[tenantId]?.[brandId] ?? {};
    return Object.keys(brandState).map((platform) => ({
      platform,
      connected: true,
      fields: Object.keys(brandState[platform]?.credentials ?? {}),
    }));
  },

  storeCredentials: async (
    tenantId: string,
    brandId: string,
    platform: string,
    credentials: Record<string, string>
  ): Promise<void> => {
    const state = await readState();
    const brandState = ensureBrandState(state, tenantId, brandId);
    brandState[platform] = {
      credentials,
      updated_at: new Date().toISOString(),
    };
    await writeState(state);
  },

  testConnection: async (
    _tenantId: string,
    _brandId: string,
    _platform: string
  ): Promise<{ success: boolean; message: string }> => {
    return {
      success: true,
      message: 'Credentials stored locally. Server-side tests require a configured vault.',
    };
  },

  deleteCredentials: async (tenantId: string, brandId: string, platform: string): Promise<void> => {
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
  },
};
