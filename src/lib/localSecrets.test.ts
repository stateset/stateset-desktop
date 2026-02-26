/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createElectronSecretsMock(initialPayload?: string | null) {
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
    } as unknown as Window['electronAPI'],
    configurable: true,
    writable: true,
  });

  return { getLocal, setLocal, clearLocal };
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

  it('returns default testConnection message', async () => {
    createElectronSecretsMock();
    const { localSecretsApi } = await import('./localSecrets');

    const result = await localSecretsApi.testConnection('t', 'b', 'p');
    expect(result.success).toBe(true);
    expect(result.message).toContain('stored locally');
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
});
