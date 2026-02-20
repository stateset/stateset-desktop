import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { secretsApi } from '../../../lib/api';
import { localSecretsApi } from '../../../lib/localSecrets';
import { getErrorMessage } from '../../../lib/errors';
import { queryKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../components/ToastProvider';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import type { ConnectionsResult } from '../types';
import { isVaultNotConfigured, getPlatformConfig, isBuiltInPlatform } from '../utils';
import { PLATFORMS } from '../platforms';

export function useConnections() {
  const { tenant, currentBrand } = useAuthStore();
  const { showToast } = useToast();

  const handleError = useCallback(
    (title: string) => (error: unknown) => {
      showToast({
        variant: 'error',
        title,
        message: getErrorMessage(error),
      });
    },
    [showToast]
  );

  const {
    data: connectionsData,
    isLoading,
    error: connectionsError,
  } = useQuery<ConnectionsResult>({
    queryKey: queryKeys.connections.list(tenant?.id, currentBrand?.id),
    queryFn: async () => {
      const tid = requireTenantId(tenant);
      const bid = requireBrandId(currentBrand);
      try {
        const connections = await secretsApi.listConnections(tid, bid);
        return {
          connections: connections.map((c) => ({ ...c, source: 'remote' as const })),
          mode: 'remote' as const,
        };
      } catch (error) {
        if (isVaultNotConfigured(error)) {
          const localConnections = await localSecretsApi.listConnections(tid, bid);
          return {
            connections: localConnections.map((c) => ({ ...c, source: 'local' as const })),
            mode: 'local' as const,
            vaultError: getErrorMessage(error),
          };
        }
        throw error;
      }
    },
    enabled: !!tenant?.id && !!currentBrand?.id,
  });

  useEffect(() => {
    if (connectionsError) {
      handleError('Failed to load connections')(connectionsError);
    }
  }, [connectionsError, handleError]);

  const connections = connectionsData?.connections ?? [];
  const connectionsMode = connectionsData?.mode ?? 'remote';
  const vaultError = connectionsData?.vaultError;
  const isLocalMode = connectionsMode === 'local';
  const connectedPlatformIds = new Set(connections.map((c) => c.platform));

  const displayedPlatforms = Array.from(
    new Set([...PLATFORMS.map((p) => p.id), ...connectedPlatformIds])
  )
    .map((id) => getPlatformConfig(id))
    .filter((p) => p.id)
    .sort((a, b) => {
      const aBuiltIn = isBuiltInPlatform(a.id);
      const bBuiltIn = isBuiltInPlatform(b.id);
      if (aBuiltIn === bBuiltIn) return a.name.localeCompare(b.name);
      return aBuiltIn ? -1 : 1;
    });

  const getConnection = (platformId: string) =>
    connections.find((c) => c.platform === platformId && c.connected);
  const isConnected = (platformId: string) => Boolean(getConnection(platformId));
  const isLocalConnection = (platformId: string) => getConnection(platformId)?.source === 'local';

  return {
    isLoading,
    isLocalMode,
    vaultError,
    displayedPlatforms,
    isConnected,
    isLocalConnection,
    handleError,
  };
}
