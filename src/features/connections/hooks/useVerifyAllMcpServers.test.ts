/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVerifyAllMcpServers } from './useVerifyAllMcpServers';

const listMcpEndpoints = vi.fn();
const probe = vi.fn();
const record = vi.fn();

vi.mock('../../../lib/localSecrets', () => ({
  localSecretsApi: {
    listMcpEndpoints: (...args: unknown[]) => listMcpEndpoints(...args),
  },
}));

const okResult = {
  ok: true as const,
  serverName: 'stateset-sync',
  serverVersion: '2.1.0',
  protocolVersion: '2025-06-18',
  toolCount: 3,
  tools: ['a'],
};

function setElectronApi(api: unknown) {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue(undefined);
  setElectronApi({ mcp: { probe } });
});

afterEach(() => {
  setElectronApi(undefined);
});

function renderVerifier(tenantId = 'tenant-1', brandId = 'brand-1') {
  return renderHook(() => useVerifyAllMcpServers({ tenantId, brandId, record }));
}

describe('useVerifyAllMcpServers', () => {
  it('probes every locally stored MCP server and records the successes', async () => {
    listMcpEndpoints.mockResolvedValue([
      { platform: 'stateset-sync', endpoint: 'https://a/mcp', authToken: 'tok' },
      { platform: 'my-mcp', endpoint: 'https://b/mcp' },
    ]);
    probe.mockResolvedValueOnce(okResult).mockResolvedValueOnce({ ok: false, error: 'nope' });

    const { result } = renderVerifier();
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    expect(listMcpEndpoints).toHaveBeenCalledWith('tenant-1', 'brand-1');
    expect(probe).toHaveBeenCalledWith({ endpoint: 'https://a/mcp', authToken: 'tok' });
    expect(probe).toHaveBeenCalledWith({ endpoint: 'https://b/mcp' });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('stateset-sync', okResult);
    expect(summary).toEqual({ verified: 1, failed: 1, total: 2 });
  });

  it('counts a thrown probe as a failure and keeps going', async () => {
    listMcpEndpoints.mockResolvedValue([
      { platform: 'a', endpoint: 'https://a/mcp' },
      { platform: 'b', endpoint: 'https://b/mcp' },
    ]);
    probe.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(okResult);

    const { result } = renderVerifier();
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    expect(summary).toEqual({ verified: 1, failed: 1, total: 2 });
  });

  it('reports nothing to do when no server has an endpoint', async () => {
    listMcpEndpoints.mockResolvedValue([]);

    const { result } = renderVerifier();
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    expect(probe).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 0, failed: 0, total: 0 });
  });

  it('does nothing without a brand', async () => {
    const { result } = renderVerifier('tenant-1', '');
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    expect(listMcpEndpoints).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 0, failed: 0, total: 0 });
  });

  it('says testing is unavailable rather than calling every server broken', async () => {
    setElectronApi(undefined);
    listMcpEndpoints.mockResolvedValue([{ platform: 'a', endpoint: 'https://a/mcp' }]);

    const { result } = renderVerifier();
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    expect(summary).toEqual({ verified: 0, failed: 0, total: 1, unavailable: true });
  });

  it('drops the stored handshake of a server that fails to answer', async () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    listMcpEndpoints.mockResolvedValue([
      { platform: 'good', endpoint: 'https://a/mcp' },
      { platform: 'bad', endpoint: 'https://b/mcp' },
      { platform: 'thrower', endpoint: 'https://c/mcp' },
    ]);
    probe
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ok: false, error: 'unauthorized' })
      .mockRejectedValueOnce(new Error('unreachable'));

    const { result } = renderHook(() =>
      useVerifyAllMcpServers({ tenantId: 'tenant-1', brandId: 'brand-1', record, forget })
    );
    await act(async () => {
      await result.current.verifyAll();
    });

    expect(forget).toHaveBeenCalledWith('bad');
    expect(forget).not.toHaveBeenCalledWith('good');
    // The probe threw, so the server was never reached and proved nothing.
    expect(forget).not.toHaveBeenCalledWith('thrower');
  });

  it('tracks that verification is in progress', async () => {
    let resolveProbe: (value: unknown) => void = () => {};
    listMcpEndpoints.mockResolvedValue([{ platform: 'a', endpoint: 'https://a/mcp' }]);
    probe.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      })
    );

    const { result } = renderVerifier();
    let pending: Promise<unknown>;
    await act(async () => {
      pending = result.current.verifyAll();
      await Promise.resolve();
    });
    expect(result.current.isVerifying).toBe(true);

    await act(async () => {
      resolveProbe(okResult);
      await pending;
    });
    expect(result.current.isVerifying).toBe(false);
  });

  it('reports a failure to read the stored connections', async () => {
    listMcpEndpoints.mockRejectedValue(new Error('keystore locked'));

    const { result } = renderVerifier();
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    // Must resolve, not reject: the click handler has nowhere to catch it.
    expect(summary).toEqual({ verified: 0, failed: 0, total: 0, error: 'keystore locked' });
  });

  it('keeps stored handshakes when the servers are simply unreachable', async () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    listMcpEndpoints.mockResolvedValue([
      { platform: 'a', endpoint: 'https://a/mcp' },
      { platform: 'b', endpoint: 'https://b/mcp' },
    ]);
    probe
      .mockResolvedValueOnce({ ok: false, error: 'Could not reach the server.', unreachable: true })
      .mockResolvedValueOnce({
        ok: false,
        error: 'The server did not respond in time.',
        unreachable: true,
      });

    const { result } = renderHook(() =>
      useVerifyAllMcpServers({ tenantId: 'tenant-1', brandId: 'brand-1', record, forget })
    );
    let summary;
    await act(async () => {
      summary = await result.current.verifyAll();
    });

    // Testing while offline must not wipe everything the servers told us.
    expect(forget).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 0, failed: 2, total: 2 });
  });
});
