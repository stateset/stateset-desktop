import { create } from 'zustand';
import { log } from '../lib/logger';
import {
  parseVerificationMap,
  toVerification,
  verificationKey,
  type McpVerificationMap,
} from '../features/connections/mcpVerifications';
import type { McpProbeResult } from '../vite-env';

const STORE_KEY = 'mcpVerifications';
const logger = log.child('McpVerifications');

interface McpVerificationsState {
  entries: McpVerificationMap;
  isLoaded: boolean;
  load: () => Promise<void>;
  record: (
    brandId: string,
    platformId: string,
    result: Extract<McpProbeResult, { ok: true }>
  ) => Promise<void>;
  forget: (brandId: string, platformId: string) => Promise<void>;
  /** Drops everything, in memory and on disk. Used when an account signs out. */
  clear: () => Promise<void>;
}

/** Dedupes concurrent loads: several consumers mount at once and each calls load(). */
let loadInFlight: Promise<void> | null = null;

/**
 * Writes the whole map back. Refuses when the stored copy was never read:
 * persisting then would replace everything on disk — other brands and servers
 * included — with whatever this session happens to hold.
 */
async function persist(
  entries: McpVerificationMap,
  failureMessage: string,
  isLoaded: boolean
): Promise<void> {
  if (!isLoaded) {
    logger.warn('Skipped persisting MCP verifications: stored copy was never read');
    return;
  }
  try {
    await window.electronAPI?.store.set(STORE_KEY, entries);
  } catch (error) {
    logger.warn(failureMessage, { error: String(error) });
  }
}

/**
 * Last successful MCP handshake per brand + server, shared by every consumer.
 *
 * One store rather than per-hook state: the Connections page records a
 * verification while the tool catalog, pickers and dashboard read it, and they
 * must all see the same map without a remount.
 *
 * Reads happen once; every write waits for that read and then persists the map
 * it owns. Ordering writes behind the read is what keeps a deletion from being
 * undone by a slower read, so no separate bookkeeping is needed.
 */
export const useMcpVerificationsStore = create<McpVerificationsState>((set, get) => ({
  entries: {},
  isLoaded: false,

  load: async () => {
    if (get().isLoaded) return;
    if (loadInFlight) return loadInFlight;

    loadInFlight = (async () => {
      try {
        const raw = await window.electronAPI?.store.get(STORE_KEY);
        // Entries recorded before this read landed win over the stored copy.
        set((state) => ({ entries: { ...parseVerificationMap(raw), ...state.entries } }));
        set({ isLoaded: true });
      } catch (error) {
        // Left unloaded so the next write retries the read rather than
        // persisting a map that may be missing what is on disk.
        logger.warn('Failed to load stored MCP verifications', { error: String(error) });
      } finally {
        loadInFlight = null;
      }
    })();

    return loadInFlight;
  },

  record: async (brandId, platformId, result) => {
    await get().load();
    const next = {
      ...get().entries,
      [verificationKey(brandId, platformId)]: toVerification(result),
    };
    set({ entries: next });
    await persist(next, 'Failed to persist MCP verification', get().isLoaded);
  },

  clear: async () => {
    loadInFlight = null;
    set({ entries: {}, isLoaded: false });
    try {
      await window.electronAPI?.store.delete(STORE_KEY);
    } catch (error) {
      logger.warn('Failed to clear MCP verifications', { error: String(error) });
    }
  },

  forget: async (brandId, platformId) => {
    await get().load();
    const next = { ...get().entries };
    delete next[verificationKey(brandId, platformId)];
    set({ entries: next });
    await persist(next, 'Failed to drop MCP verification', get().isLoaded);
  },
}));
