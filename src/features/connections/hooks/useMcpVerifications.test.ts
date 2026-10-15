/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMcpVerifications } from './useMcpVerifications';
import { useMcpVerificationsStore } from '../../../stores/mcpVerifications';

const storeGet = vi.fn();
const storeSet = vi.fn();

const probeResult = {
  ok: true as const,
  serverName: 'stateset-sync',
  serverVersion: '2.1.0',
  protocolVersion: '2025-06-18',
  toolCount: 3,
  tools: ['a', 'b', 'c'],
};

function setElectronApi(api: unknown) {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  storeGet.mockResolvedValue({});
  storeSet.mockResolvedValue(true);
  setElectronApi({ store: { get: storeGet, set: storeSet } });
  useMcpVerificationsStore.setState({ entries: {}, isLoaded: false });
});

afterEach(() => {
  setElectronApi(undefined);
});

describe('useMcpVerifications', () => {
  it("shows only this brand's verifications", async () => {
    const entry = {
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      toolCount: 3,
      tools: [],
      verifiedAt: '2026-09-20T12:00:00.000Z',
    };
    storeGet.mockResolvedValue({
      'brand-1:stateset-sync': entry,
      'brand-2:shopify': { ...entry, serverName: 'other-brand' },
    });

    const { result } = renderHook(() => useMcpVerifications('brand-1'));

    await waitFor(() => expect(result.current.verifications['stateset-sync']).toBeDefined());
    expect(storeGet).toHaveBeenCalledWith('mcpVerifications');
    // A different brand's entry must not leak into this brand's view.
    expect(result.current.verifications.shopify).toBeUndefined();
  });

  it('records a verification under the brand it belongs to', async () => {
    const { result } = renderHook(() => useMcpVerifications('brand-1'));

    await act(async () => {
      await result.current.record('stateset-sync', probeResult);
    });

    expect(result.current.verifications['stateset-sync']).toMatchObject({ toolCount: 3 });
    expect(storeSet).toHaveBeenCalledWith(
      'mcpVerifications',
      expect.objectContaining({ 'brand-1:stateset-sync': expect.any(Object) })
    );
  });

  it('forgets a verification when its credentials go away', async () => {
    const { result } = renderHook(() => useMcpVerifications('brand-1'));
    await act(async () => {
      await result.current.record('stateset-sync', probeResult);
    });

    await act(async () => {
      await result.current.forget('stateset-sync');
    });

    expect(result.current.verifications['stateset-sync']).toBeUndefined();
  });

  it('shares recorded verifications with every other consumer', async () => {
    const { result: writer } = renderHook(() => useMcpVerifications('brand-1'));
    const { result: reader } = renderHook(() => useMcpVerifications('brand-1'));

    await act(async () => {
      await writer.current.record('stateset-sync', probeResult);
    });

    // The second consumer sees it without remounting.
    expect(reader.current.verifications['stateset-sync']).toMatchObject({ toolCount: 3 });

    await act(async () => {
      await writer.current.forget('stateset-sync');
    });

    expect(reader.current.verifications['stateset-sync']).toBeUndefined();
  });

  it('ignores malformed stored data', async () => {
    storeGet.mockResolvedValue('not a map');

    const { result } = renderHook(() => useMcpVerifications('brand-1'));

    await waitFor(() => expect(storeGet).toHaveBeenCalled());
    expect(result.current.verifications).toEqual({});
  });

  it('survives a store that is unavailable', async () => {
    setElectronApi(undefined);

    const { result } = renderHook(() => useMcpVerifications('brand-1'));

    await act(async () => {
      await result.current.record('stateset-sync', probeResult);
    });

    // Still reflected in the session, just not persisted.
    expect(result.current.verifications['stateset-sync']).toBeDefined();
  });

  it('does nothing without a brand', async () => {
    const { result } = renderHook(() => useMcpVerifications(''));

    await waitFor(() => expect(result.current.verifications).toEqual({}));
    expect(storeGet).not.toHaveBeenCalled();
  });
});
