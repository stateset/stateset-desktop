/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createElectronSecretsMock(
  initialPayload?: string | null,
  probe?: ReturnType<typeof vi.fn>
) {
  const getLocal = vi.fn().mockResolvedValue(initialPayload ?? null);
  const setLocal = vi.fn().mockResolvedValue(true);
  const clearLocal = vi.fn().mockResolvedValue(true);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      secrets: {
        getLocal,
        setLocal,
        clearLocal,
      },
      ...(probe ? { mcp: { probe } } : {}),
    } as unknown as Window['electronAPI'],
    configurable: true,
    writable: true,
  });

  return { getLocal, setLocal, clearLocal, probe };
}

function payloadWith(credentials: Record<string, string>): string {
  return JSON.stringify({
    t: { b: { 'stateset-sync': { credentials, updated_at: '2026-09-20T00:00:00.000Z' } } },
  });
}

describe('localSecretsApi', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('lists connections from stored secrets', async () => {
    createElectronSecretsMock(
      JSON.stringify({
        tenant1: {
          brand1: {
            shopify: { credentials: { apiKey: 'k1' }, updated_at: '2026-02-26T00:00:00Z' },
            gorgias: {
              credentials: { domain: 'acme' },
              updated_at: '2026-02-26T00:00:00Z',
            },
          },
        },
      })
    );
    const { localSecretsApi } = await import('./localSecrets');

    const connections = await localSecretsApi.listConnections('tenant1', 'brand1');
    expect(connections).toEqual(
      expect.arrayContaining([
        { platform: 'shopify', connected: true, fields: ['apiKey'] },
        { platform: 'gorgias', connected: true, fields: ['domain'] },
      ])
    );
  });

  it('stores credentials and writes updated state', async () => {
    const { setLocal } = createElectronSecretsMock(JSON.stringify({}));
    const { localSecretsApi } = await import('./localSecrets');

    await localSecretsApi.storeCredentials('tenant1', 'brand1', 'shopify', { token: 'abc' });

    expect(setLocal).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(setLocal.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.tenant1).toBeDefined();
  });

  it.each([false, undefined])(
    'rejects an unconfirmed credential save (%s) and permits a later retry',
    async (ack) => {
      const { setLocal } = createElectronSecretsMock('{}');
      setLocal.mockResolvedValueOnce(ack);
      const { localSecretsApi } = await import('./localSecrets');
      await expect(
        localSecretsApi.storeCredentials('tenant', 'brand', 'nsr', { api_key: 'key' })
      ).rejects.toThrow('did not confirm the save');
      await expect(
        localSecretsApi.storeCredentials('tenant', 'brand', 'nsr', { api_key: 'new-key' })
      ).resolves.toBeUndefined();
      expect(setLocal).toHaveBeenCalledTimes(2);
    }
  );
  it('serializes overlapping brand saves against the latest vault and snapshots submitted values', async () => {
    const { getLocal, setLocal } = createElectronSecretsMock('{}');
    let vault = '{}';
    let finish!: () => void;
    getLocal.mockImplementation(async () => vault);
    setLocal
      .mockImplementationOnce(
        (payload: string) =>
          new Promise<boolean>((resolve) => {
            finish = () => {
              vault = payload;
              resolve(true);
            };
          })
      )
      .mockImplementation(async (payload: string) => {
        vault = payload;
        return true;
      });
    const { localSecretsApi } = await import('./localSecrets');
    const first = localSecretsApi.storeCredentials('tenant', 'first', 'nsr', {
      api_key: 'first-key',
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const submitted = { api_key: 'second-key' };
    const second = localSecretsApi.storeCredentials('tenant', 'second', 'nsr', submitted);
    submitted.api_key = 'unsaved-edit';
    expect(getLocal).toHaveBeenCalledOnce();
    finish();
    await Promise.all([first, second]);
    const result = JSON.parse(vault);
    expect(result.tenant.first.nsr.credentials.api_key).toBe('first-key');
    expect(result.tenant.second.nsr.credentials.api_key).toBe('second-key');
  });
  it('retains a concurrent brand save when removing a different brand connection', async () => {
    const { getLocal, setLocal } = createElectronSecretsMock();
    let vault = JSON.stringify({
      tenant: { first: { nsr: { credentials: { api_key: 'old-key' }, updated_at: '' } } },
    });
    let finish!: () => void;
    getLocal.mockImplementation(async () => vault);
    setLocal
      .mockImplementationOnce(
        (payload: string) =>
          new Promise<boolean>((resolve) => {
            finish = () => {
              vault = payload;
              resolve(true);
            };
          })
      )
      .mockImplementation(async (payload: string) => {
        vault = payload;
        return true;
      });
    const { localSecretsApi } = await import('./localSecrets');
    const saving = localSecretsApi.storeCredentials('tenant', 'second', 'nsr', {
      api_key: 'new-key',
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const deleting = localSecretsApi.deleteCredentials('tenant', 'first', 'nsr');
    finish();
    await Promise.all([saving, deleting]);
    expect(JSON.parse(vault).tenant.first).toBeUndefined();
    expect(JSON.parse(vault).tenant.second.nsr.credentials.api_key).toBe('new-key');
  });
  it('rejects an unconfirmed credential removal', async () => {
    const { clearLocal } = createElectronSecretsMock(payloadWith({ token: 'keep-me' }));
    clearLocal.mockResolvedValueOnce(false);
    const { localSecretsApi } = await import('./localSecrets');
    await expect(localSecretsApi.deleteCredentials('t', 'b', 'stateset-sync')).rejects.toThrow(
      'did not confirm the removal'
    );
  });
  it('deletes credentials and clears storage when state becomes empty', async () => {
    const { clearLocal, setLocal } = createElectronSecretsMock(
      JSON.stringify({
        tenant1: {
          brand1: {
            shopify: { credentials: { token: 'abc' }, updated_at: '2026-02-26T00:00:00Z' },
          },
        },
      })
    );
    const { localSecretsApi } = await import('./localSecrets');

    await localSecretsApi.deleteCredentials('tenant1', 'brand1', 'shopify');

    expect(clearLocal).toHaveBeenCalledTimes(1);
    expect(setLocal).not.toHaveBeenCalled();
  });

  it('writes partial state when other secrets remain after deletion', async () => {
    const { clearLocal, setLocal } = createElectronSecretsMock(
      JSON.stringify({
        tenant1: {
          brand1: {
            shopify: { credentials: { token: 'abc' }, updated_at: '2026-02-26T00:00:00Z' },
            gorgias: { credentials: { token: 'xyz' }, updated_at: '2026-02-26T00:00:00Z' },
          },
        },
      })
    );
    const { localSecretsApi } = await import('./localSecrets');

    await localSecretsApi.deleteCredentials('tenant1', 'brand1', 'shopify');

    expect(clearLocal).not.toHaveBeenCalled();
    expect(setLocal).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(setLocal.mock.calls[0][0] as string) as {
      tenant1: { brand1: Record<string, unknown> };
    };
    expect(payload.tenant1.brand1.shopify).toBeUndefined();
    expect(payload.tenant1.brand1.gorgias).toBeDefined();
  });

  it('reports when no credentials are stored for the platform', async () => {
    createElectronSecretsMock();
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'p');
    expect(result).toEqual({
      success: false,
      message: 'No credentials are stored on this device for that server.',
    });
  });

  it('runs a real MCP handshake for a stored endpoint', async () => {
    const probe = vi.fn().mockResolvedValue({
      ok: true,
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      protocolVersion: '2025-06-18',
      toolCount: 3,
      tools: ['a', 'b', 'c'],
    });
    createElectronSecretsMock(
      payloadWith({ endpoint: 'https://api.sync.stateset.com/mcp', auth_token: 'ss_sync_x' }),
      probe
    );
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(probe).toHaveBeenCalledWith({
      endpoint: 'https://api.sync.stateset.com/mcp',
      authToken: 'ss_sync_x',
    });
    // The probe result rides along so the caller can record the verification.
    expect(result).toMatchObject({
      success: true,
      message: 'stateset-sync 2.1.0 · 3 tools',
      probe: { ok: true, toolCount: 3 },
    });
  });

  it('passes a failed handshake through as the test result', async () => {
    const probe = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Unauthorized — check the API key.' });
    createElectronSecretsMock(payloadWith({ endpoint: 'https://mcp.example.com/mcp' }), probe);
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(result).toMatchObject({
      success: false,
      tested: true,
      message: 'Unauthorized — check the API key.',
      // The server answered, so this result can disprove a stored handshake.
      probe: { ok: false, error: 'Unauthorized — check the API key.' },
    });
    expect((result.probe as { unreachable?: boolean }).unreachable).toBeUndefined();
  });

  it('reports a thrown probe error', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('probe exploded'));
    createElectronSecretsMock(payloadWith({ endpoint: 'https://mcp.example.com/mcp' }), probe);
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(result).toMatchObject({
      success: false,
      tested: true,
      message: 'probe exploded',
      // Never reached, so it proves nothing about the server.
      probe: { unreachable: true },
    });
  });

  it('cannot verify a platform that has no MCP endpoint', async () => {
    const probe = vi.fn();
    createElectronSecretsMock(payloadWith({ api_key: 'k' }), probe);
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(probe).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      tested: false,
      message: 'Credentials are stored locally. This platform has no MCP endpoint to test.',
    });
  });

  it('cannot run a handshake outside the desktop app', async () => {
    createElectronSecretsMock(payloadWith({ endpoint: 'https://mcp.example.com/mcp' }));
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(result).toEqual({
      success: true,
      tested: false,
      message: 'Credentials are stored locally. Testing is only available in the desktop app.',
    });
  });

  it('falls back to in-memory state when electronAPI is unavailable', async () => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    const { localSecretsApi } = await import('./localSecrets');

    await localSecretsApi.storeCredentials('tenant2', 'brand2', 'zendesk', { subdomain: 'acme' });
    const connections = await localSecretsApi.listConnections('tenant2', 'brand2');

    expect(connections).toEqual([
      {
        platform: 'zendesk',
        connected: true,
        fields: ['subdomain'],
      },
    ]);
  });

  describe('listMcpEndpoints', () => {
    it('returns only platforms that have an MCP endpoint', async () => {
      createElectronSecretsMock(
        JSON.stringify({
          t: {
            b: {
              'stateset-sync': {
                credentials: { endpoint: 'https://a/mcp', auth_token: 'tok' },
                updated_at: '2026-09-20T00:00:00.000Z',
              },
              shopify: {
                credentials: { shop_domain: 'x.myshopify.com', access_token: 'k' },
                updated_at: '2026-09-20T00:00:00.000Z',
              },
              'my-mcp': {
                credentials: { endpoint: 'https://b/mcp' },
                updated_at: '2026-09-20T00:00:00.000Z',
              },
            },
          },
        })
      );
      const { localSecretsApi } = await import('./localSecrets');

      expect(await localSecretsApi.listMcpEndpoints('t', 'b')).toEqual([
        { platform: 'stateset-sync', endpoint: 'https://a/mcp', authToken: 'tok' },
        { platform: 'my-mcp', endpoint: 'https://b/mcp', authToken: undefined },
      ]);
    });

    it('returns nothing for an unknown brand', async () => {
      createElectronSecretsMock();
      const { localSecretsApi } = await import('./localSecrets');

      expect(await localSecretsApi.listMcpEndpoints('t', 'nope')).toEqual([]);
    });
  });

  it('does not probe a stdio command stored as the endpoint', async () => {
    const probe = vi.fn();
    createElectronSecretsMock(payloadWith({ endpoint: 'npx -y stateset-nsr-mcp' }), probe);
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'stateset-sync');

    expect(probe).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      tested: false,
      message: 'Stored locally. This is a local command, which cannot be tested from here.',
    });
  });

  it('leaves stdio commands out of the bulk-verify list', async () => {
    createElectronSecretsMock(
      JSON.stringify({
        t: {
          b: {
            'stateset-sync': {
              credentials: { endpoint: 'https://a/mcp' },
              updated_at: '2026-09-20T00:00:00.000Z',
            },
            'local-nsr': {
              credentials: { endpoint: 'npx -y stateset-nsr-mcp' },
              updated_at: '2026-09-20T00:00:00.000Z',
            },
          },
        },
      })
    );
    const { localSecretsApi } = await import('./localSecrets');

    // A command cannot be probed, so it must not be counted as a failure.
    expect(await localSecretsApi.listMcpEndpoints('t', 'b')).toEqual([
      { platform: 'stateset-sync', endpoint: 'https://a/mcp', authToken: undefined },
    ]);
  });
});
