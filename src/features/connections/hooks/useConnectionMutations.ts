import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { secretsApi } from '../../../lib/api';
import { localSecretsApi } from '../../../lib/localSecrets';
import { queryKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../components/ToastProvider';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import { getErrorMessage } from '../../../lib/errors';
import { isVaultNotConfigured, getPlatformConfig, buildCredentialsForSave } from '../utils';

export function useConnectionMutations(isLocalMode: boolean) {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const handleMutationError = (title: string) => (error: unknown) => {
    showToast({ variant: 'error', title, message: getErrorMessage(error) });
  };

  const storeCredentialsFn = async (platform: string, creds: Record<string, string>) => {
    const tid = requireTenantId(tenant);
    const bid = requireBrandId(currentBrand);
    const platformConfig = getPlatformConfig(platform);
    const normalizedCredentials = buildCredentialsForSave(platformConfig, creds);

    if (isLocalMode) {
      await localSecretsApi.storeCredentials(tid, bid, platform, normalizedCredentials);
      return;
    }
    try {
      await secretsApi.storeCredentials(tid, bid, platform, normalizedCredentials);
    } catch (error) {
      if (isVaultNotConfigured(error)) {
        await localSecretsApi.storeCredentials(tid, bid, platform, normalizedCredentials);
        return;
      }
      throw error;
    }
  };

  const testConnectionFn = async (platform: string) => {
    const tid = requireTenantId(tenant);
    const bid = requireBrandId(currentBrand);
    if (isLocalMode) {
      return localSecretsApi.testConnection(tid, bid, platform);
    }
    try {
      return await secretsApi.testConnection(tid, bid, platform);
    } catch (error) {
      if (isVaultNotConfigured(error)) {
        return localSecretsApi.testConnection(tid, bid, platform);
      }
      throw error;
    }
  };

  const deleteCredentialsFn = async (platform: string) => {
    const tid = requireTenantId(tenant);
    const bid = requireBrandId(currentBrand);
    if (isLocalMode) {
      await localSecretsApi.deleteCredentials(tid, bid, platform);
      return;
    }
    try {
      await secretsApi.deleteCredentials(tid, bid, platform);
    } catch (error) {
      if (isVaultNotConfigured(error)) {
        await localSecretsApi.deleteCredentials(tid, bid, platform);
        return;
      }
      throw error;
    }
  };

  const storeCredentials = useMutation({
    mutationFn: ({ platform, creds }: { platform: string; creds: Record<string, string> }) =>
      storeCredentialsFn(platform, creds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all });
      showToast({
        variant: 'success',
        title: 'Credentials saved',
        message: isLocalMode
          ? 'Stored locally. Configure vault to enable cloud agent access.'
          : 'Platform credentials were stored successfully.',
      });
    },
    onError: handleMutationError('Failed to store credentials'),
  });

  const testConnection = useMutation({
    mutationFn: (platform: string) => testConnectionFn(platform),
  });

  const deleteCredentials = useMutation({
    mutationFn: (platform: string) => deleteCredentialsFn(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all });
      showToast({
        variant: 'success',
        title: 'Disconnected',
        message: isLocalMode
          ? 'Local credentials were removed.'
          : 'Platform credentials were removed.',
      });
    },
    onError: handleMutationError('Failed to disconnect'),
  });

  return { storeCredentials, testConnection, deleteCredentials };
}
