import { describe, expect, it, vi } from 'vitest';
import { checkForDesktopUpdates, type UpdateStatusSnapshot } from './update-check';

function fixture(initial: Partial<UpdateStatusSnapshot> = {}) {
  let snapshot: UpdateStatusSnapshot = {
    status: 'idle',
    checking: false,
    available: false,
    progress: 0,
    ...initial,
  };
  return {
    get: () => snapshot,
    set: (next: Partial<UpdateStatusSnapshot>) => {
      snapshot = { ...snapshot, ...next };
    },
  };
}

describe('desktop update checks', () => {
  it('uses availability rather than the version returned for an unchanged release', async () => {
    const state = fixture();
    const updater = {
      checkForUpdates: vi.fn().mockResolvedValue({
        isUpdateAvailable: false,
        updateInfo: { version: '1.1.20' },
      }),
    };
    expect(await checkForDesktopUpdates(updater, state)).toEqual({
      available: false,
      snapshot: state.get(),
    });
    expect(state.get()).toMatchObject({ status: 'current', available: false, checking: false });
    expect(state.get().version).toBeUndefined();
  });
  it('records a new version when an update really is available', async () => {
    const state = fixture();
    const updater = {
      checkForUpdates: vi.fn().mockResolvedValue({
        isUpdateAvailable: true,
        updateInfo: { version: '1.1.21' },
      }),
    };
    expect(await checkForDesktopUpdates(updater, state)).toEqual({
      available: true,
      version: '1.1.21',
      snapshot: state.get(),
    });
    expect(state.get()).toMatchObject({ status: 'available', version: '1.1.21', checking: false });
  });
  for (const status of ['available', 'downloading', 'ready'] as const) {
    it(`preserves ${status} state without another provider request`, async () => {
      const state = fixture({ status, available: true, progress: 73, version: '1.1.21' });
      const updater = { checkForUpdates: vi.fn() };
      const before = state.get();
      expect(await checkForDesktopUpdates(updater, state)).toEqual({
        available: true,
        version: '1.1.21',
        snapshot: state.get(),
      });
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      expect(state.get()).toBe(before);
    });
  }
  for (const status of ['downloading', 'ready', 'current', 'error'] as const) {
    it(`does not overwrite a native ${status} event when the check settles`, async () => {
      const state = fixture();
      const updater = {
        checkForUpdates: vi.fn(async () => {
          state.set({
            status,
            available: status === 'ready' || status === 'downloading',
            progress: 87,
            version: '1.1.21',
            error: status === 'error' ? 'Signature rejected' : undefined,
          });
          return { isUpdateAvailable: true, updateInfo: { version: '1.1.21' } };
        }),
      };
      await checkForDesktopUpdates(updater, state);
      expect(state.get()).toMatchObject({ status, progress: 87 });
    });
  }
  it('does not report an absent provider result as a successful check', async () => {
    const state = fixture();
    const response = await checkForDesktopUpdates({ checkForUpdates: async () => null }, state);
    expect(response.error).toMatch(/no usable result/);
    expect(state.get()).toMatchObject({ status: 'error', checking: false });
  });
  it('makes rejected checks recoverable and clears stale errors on retry', async () => {
    const state = fixture();
    const updater = {
      checkForUpdates: vi
        .fn()
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({ isUpdateAvailable: false, updateInfo: { version: '1.1.20' } }),
    };
    expect(await checkForDesktopUpdates(updater, state)).toEqual({
      available: false,
      error: 'Network unavailable',
      snapshot: state.get(),
    });
    expect(await checkForDesktopUpdates(updater, state)).toEqual({
      available: false,
      snapshot: state.get(),
    });
    expect(state.get()).toMatchObject({ status: 'current', error: undefined });
  });
  it('retains a downloaded update even if the old check later rejects', async () => {
    const state = fixture();
    const updater = {
      checkForUpdates: vi.fn(async () => {
        state.set({
          status: 'ready',
          checking: false,
          available: true,
          progress: 100,
          version: '1.1.21',
        });
        throw new Error('Late provider failure');
      }),
    };
    expect(await checkForDesktopUpdates(updater, state)).toEqual({
      available: true,
      version: '1.1.21',
      snapshot: state.get(),
    });
    expect(state.get().status).toBe('ready');
  });
});
