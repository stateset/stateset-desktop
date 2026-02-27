/**
 * Centralized query key factory for React Query
 *
 * This ensures consistent cache key naming across the app and makes
 * invalidation patterns explicit and type-safe.
 *
 * Usage:
 *   useQuery({ queryKey: queryKeys.sessions.list(tenantId, brandId), ... })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
 */

export const queryKeys = {
  // Sessions
  sessions: {
    all: ['sessions'] as const,
    list: (tenantId?: string, brandId?: string) => ['sessions', tenantId, brandId] as const,
    detail: (tenantId?: string, brandId?: string, sessionId?: string) =>
      ['session', tenantId, brandId, sessionId] as const,
  },

  // Connections/Secrets
  connections: {
    all: ['connections'] as const,
    list: (tenantId?: string, brandId?: string) => ['connections', tenantId, brandId] as const,
    platform: (tenantId: string, brandId: string, platform: string) =>
      ['connections', tenantId, brandId, platform] as const,
  },

  // Webhooks
  webhooks: {
    all: ['webhooks'] as const,
    list: (tenantId?: string, brandId?: string) => ['webhooks', tenantId, brandId] as const,
    detail: (tenantId?: string, brandId?: string, webhookId?: string) =>
      ['webhook', tenantId, brandId, webhookId] as const,
    deliveries: (tenantId?: string, brandId?: string, webhookId?: string) =>
      ['webhook', tenantId, brandId, webhookId, 'deliveries'] as const,
  },

  // Brands
  brands: {
    all: ['brands'] as const,
    list: (tenantId: string) => ['brands', tenantId] as const,
    detail: (tenantId: string, brandId: string) => ['brands', tenantId, brandId] as const,
  },
} as const;

// Type helpers for query key inference
export type QueryKeys = typeof queryKeys;
export type SessionsQueryKey = ReturnType<typeof queryKeys.sessions.list>;
export type SessionDetailQueryKey = ReturnType<typeof queryKeys.sessions.detail>;
export type ConnectionsQueryKey = ReturnType<typeof queryKeys.connections.list>;
