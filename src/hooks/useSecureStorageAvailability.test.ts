/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useSecureStorageAvailability } from './useSecureStorageAvailability';

const original = window.electronAPI;
afterEach(() => {
  cleanup();
  window.electronAPI = original;
});
function capability(check: () => Promise<boolean>) {
  window.electronAPI = { auth: { isSecureStorageAvailable: check } } as typeof window.electronAPI;
}
describe('credential storage capability', () => {
  it.each([true, false])('reports the native capability as %s', async (value) => {
    capability(vi.fn().mockResolvedValue(value));
    const { result } = renderHook(useSecureStorageAvailability);
    await waitFor(() => expect(result.current).toBe(value));
  });
  it('does not claim persistent storage when the native check fails', async () => {
    const check = vi.fn().mockRejectedValue(new Error('IPC unavailable'));
    capability(check);
    const { result } = renderHook(useSecureStorageAvailability);
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
  });
  it('leaves browser capability unknown', () => {
    window.electronAPI = undefined;
    const { result } = renderHook(useSecureStorageAvailability);
    expect(result.current).toBeNull();
  });
});
