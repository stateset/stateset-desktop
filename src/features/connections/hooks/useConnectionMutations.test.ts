/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useConnectionMutations } from './useConnectionMutations';

// --- Mocks ---

const mockStoreCredentials = vi.fn();
const mockTestConnection = vi.fn();
const mockDeleteCredentials = vi.fn();
const mockLocalStoreCredentials = vi.fn();
const mockLocalTestConnection = vi.fn();
const mockLocalDeleteCredentials = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../lib/api', () => ({
  secretsApi: {
    storeCredentials: (...args: unknown[]) => mockStoreCredentials(...args),
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    deleteCredentials: (...args: unknown[]) => mockDeleteCredentials(...args),
  },
}));

vi.mock('../../../lib/localSecrets', () => ({
  localSecretsApi: {
    storeCredentials: (...args: unknown[]) => mockLocalStoreCredentials(...args),
    testConnection: (...args: unknown[]) => mockLocalTestConnection(...args),
    deleteCredentials: (...args: unknown[]) => mockLocalDeleteCredentials(...args),
  },
}));

vi.mock('../../../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    tenant: { id: 'tenant-1' },
    currentBrand: { id: 'brand-1' },
  })),
}));

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../../lib/auth-guards', () => ({
  requireTenantId: (t: { id?: string } | null) => t?.id,
  requireBrandId: (b: { id?: string } | null) => b?.id,
}));

// --- Helpers ---

function setup(isLocalMode = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(() => useConnectionMutations(isLocalMode), { wrapper });
  return { ...rendered, invalidateSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConnectionMutations', () => {
  describe('storeCredentials', () => {
    it('stores normalized credentials remotely and invalidates connections', async () => {
      mockStoreCredentials.mockResolvedValue(undefined);
      const { result, invalidateSpy } = setup();

      result.current.storeCredentials.mutate({
        platform: 'shopify',
        creds: { shop_domain: ' https://MyStore.myshopify.com/ ', access_token: ' tok ' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isSuccess).toBe(true));

      expect(mockStoreCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify', {
        shop_domain: 'mystore.myshopify.com',
        access_token: 'tok',
      });
      expect(mockLocalStoreCredentials).not.toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['connections'] });
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          title: 'Credentials saved',
          message: 'Platform credentials were stored successfully.',
        })
      );
    });

    it('stores locally without touching the remote API in local mode', async () => {
      mockLocalStoreCredentials.mockResolvedValue(undefined);
      const { result } = setup(true);

      result.current.storeCredentials.mutate({
        platform: 'klaviyo',
        creds: { api_key: 'abc' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isSuccess).toBe(true));

      expect(mockLocalStoreCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'klaviyo', {
        api_key: 'abc',
      });
      expect(mockStoreCredentials).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          message: 'Stored locally. Configure vault to enable cloud agent access.',
        })
      );
    });

    it('falls back to local storage when the vault is not configured', async () => {
      mockStoreCredentials.mockRejectedValue(new Error('Vault is not configured'));
      mockLocalStoreCredentials.mockResolvedValue(undefined);
      const { result } = setup();

      result.current.storeCredentials.mutate({
        platform: 'klaviyo',
        creds: { api_key: 'abc' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isSuccess).toBe(true));
      expect(mockLocalStoreCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'klaviyo', {
        api_key: 'abc',
      });
    });

    it('shows an error toast for non-vault failures', async () => {
      mockStoreCredentials.mockRejectedValue(new Error('boom'));
      const { result } = setup();

      result.current.storeCredentials.mutate({
        platform: 'klaviyo',
        creds: { api_key: 'abc' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isError).toBe(true));
      expect(mockLocalStoreCredentials).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Failed to store credentials',
          message: 'boom',
        })
      );
    });

    it('rejects when a required field is missing', async () => {
      const { result } = setup();

      result.current.storeCredentials.mutate({
        platform: 'klaviyo',
        creds: { api_key: '   ' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isError).toBe(true));
      expect(mockStoreCredentials).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Failed to store credentials',
          message: 'Please provide api key.',
        })
      );
    });

    it('drops empty optional fields when saving custom platforms', async () => {
      mockStoreCredentials.mockResolvedValue(undefined);
      const { result } = setup();

      result.current.storeCredentials.mutate({
        platform: 'my-custom-mcp',
        creds: { endpoint: 'https://mcp.example.com', auth_token: '' },
      });

      await waitFor(() => expect(result.current.storeCredentials.isSuccess).toBe(true));
      expect(mockStoreCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'my-custom-mcp', {
        endpoint: 'https://mcp.example.com',
      });
    });
  });

  describe('testConnection', () => {
    it('tests remotely and returns the result', async () => {
      mockTestConnection.mockResolvedValue({ ok: true });
      const { result } = setup();

      result.current.testConnection.mutate('shopify');

      await waitFor(() => expect(result.current.testConnection.isSuccess).toBe(true));
      expect(mockTestConnection).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify');
      expect(result.current.testConnection.data).toEqual({ ok: true });
    });

    it('tests locally in local mode', async () => {
      mockLocalTestConnection.mockResolvedValue({ ok: true });
      const { result } = setup(true);

      result.current.testConnection.mutate('shopify');

      await waitFor(() => expect(result.current.testConnection.isSuccess).toBe(true));
      expect(mockLocalTestConnection).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify');
      expect(mockTestConnection).not.toHaveBeenCalled();
    });

    it('falls back to local testing when the vault is not configured', async () => {
      mockTestConnection.mockRejectedValue(new Error('vault not configured for tenant'));
      mockLocalTestConnection.mockResolvedValue({ ok: false });
      const { result } = setup();

      result.current.testConnection.mutate('shopify');

      await waitFor(() => expect(result.current.testConnection.isSuccess).toBe(true));
      expect(result.current.testConnection.data).toEqual({ ok: false });
    });

    it('propagates non-vault errors', async () => {
      mockTestConnection.mockRejectedValue(new Error('network down'));
      const { result } = setup();

      result.current.testConnection.mutate('shopify');

      await waitFor(() => expect(result.current.testConnection.isError).toBe(true));
      expect(mockLocalTestConnection).not.toHaveBeenCalled();
    });
  });

  describe('deleteCredentials', () => {
    it('deletes remotely, invalidates connections and toasts', async () => {
      mockDeleteCredentials.mockResolvedValue(undefined);
      const { result, invalidateSpy } = setup();

      result.current.deleteCredentials.mutate('shopify');

      await waitFor(() => expect(result.current.deleteCredentials.isSuccess).toBe(true));
      expect(mockDeleteCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['connections'] });
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          title: 'Disconnected',
          message: 'Platform credentials were removed.',
        })
      );
    });

    it('deletes locally in local mode', async () => {
      mockLocalDeleteCredentials.mockResolvedValue(undefined);
      const { result } = setup(true);

      result.current.deleteCredentials.mutate('shopify');

      await waitFor(() => expect(result.current.deleteCredentials.isSuccess).toBe(true));
      expect(mockLocalDeleteCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify');
      expect(mockDeleteCredentials).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Local credentials were removed.' })
      );
    });

    it('falls back to local deletion when the vault is not configured', async () => {
      mockDeleteCredentials.mockRejectedValue(new Error('Vault is not configured'));
      mockLocalDeleteCredentials.mockResolvedValue(undefined);
      const { result } = setup();

      result.current.deleteCredentials.mutate('shopify');

      await waitFor(() => expect(result.current.deleteCredentials.isSuccess).toBe(true));
      expect(mockLocalDeleteCredentials).toHaveBeenCalledWith('tenant-1', 'brand-1', 'shopify');
    });

    it('shows an error toast when deletion fails', async () => {
      mockDeleteCredentials.mockRejectedValue(new Error('boom'));
      const { result } = setup();

      result.current.deleteCredentials.mutate('shopify');

      await waitFor(() => expect(result.current.deleteCredentials.isError).toBe(true));
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', title: 'Failed to disconnect' })
      );
    });
  });
});
