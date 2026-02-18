import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth';

// Mock fetch globally
global.fetch = vi.fn();

// Mock electron API
const mockElectronAPI = {
  auth: {
    getApiKey: vi.fn(),
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
  },
  store: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
});

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      apiKey: null,
      tenant: null,
      brands: [],
      currentBrand: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  describe('initial state', () => {
    it('should start unauthenticated', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.apiKey).toBeNull();
      expect(state.tenant).toBeNull();
    });

    it('should have empty brands array', () => {
      const state = useAuthStore.getState();
      expect(state.brands).toEqual([]);
      expect(state.currentBrand).toBeNull();
    });
  });

  describe('setCurrentBrand', () => {
    it('should set the current brand', () => {
      const brand = {
        id: 'brand-1',
        tenant_id: 'tenant-123',
        slug: 'brand-one',
        name: 'Brand One',
        support_platform: 'gorgias',
        ecommerce_platform: 'shopify',
        config: {},
        mcp_servers: [],
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
      };

      const store = useAuthStore.getState();
      store.setCurrentBrand(brand);

      const newState = useAuthStore.getState();
      expect(newState.currentBrand).toEqual(brand);
    });
  });

  describe('setBrands', () => {
    it('should set brands array', () => {
      const brands = [
        {
          id: 'brand-1',
          tenant_id: 'tenant-123',
          slug: 'brand-one',
          name: 'Brand One',
          support_platform: 'gorgias',
          ecommerce_platform: 'shopify',
          config: {},
          mcp_servers: [],
          enabled: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const store = useAuthStore.getState();
      store.setBrands(brands);

      const newState = useAuthStore.getState();
      expect(newState.brands).toEqual(brands);
    });

    it('should auto-select first brand if none selected', () => {
      const brands = [
        {
          id: 'brand-1',
          tenant_id: 'tenant-123',
          slug: 'brand-one',
          name: 'Brand One',
          support_platform: 'gorgias',
          ecommerce_platform: 'shopify',
          config: {},
          mcp_servers: [],
          enabled: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const store = useAuthStore.getState();
      store.setBrands(brands);

      const newState = useAuthStore.getState();
      expect(newState.currentBrand).toEqual(brands[0]);
    });
  });

  describe('logout', () => {
    it('should clear all authentication state', async () => {
      // Set up authenticated state directly
      useAuthStore.setState({
        isAuthenticated: true,
        apiKey: 'sk-test-key',
        tenant: {
          id: 'tenant-123',
          name: 'Test Tenant',
          slug: 'test-tenant',
          tier: 'pro',
          created_at: '2024-01-01T00:00:00Z',
        },
        brands: [],
        currentBrand: null,
        isLoading: false,
      });

      // Logout
      await useAuthStore.getState().logout();

      const newState = useAuthStore.getState();
      expect(newState.apiKey).toBeNull();
      expect(newState.tenant).toBeNull();
      expect(newState.brands).toEqual([]);
      expect(newState.currentBrand).toBeNull();
      expect(newState.isAuthenticated).toBe(false);
    });
  });
});
