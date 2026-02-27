import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { useAuditLogStore } from '../../../stores/auditLog';
import { webhooksApi } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import { useToast } from '../../../components/ToastProvider';
import { getErrorMessage } from '../../../lib/errors';
import type { Webhook, WebhookDelivery } from '../../../types';

export function useWebhooksList() {
  const { tenant, currentBrand } = useAuthStore();

  return useQuery<Webhook[]>({
    queryKey: queryKeys.webhooks.list(tenant?.id, currentBrand?.id),
    queryFn: () => webhooksApi.list(requireTenantId(tenant), requireBrandId(currentBrand)),
    enabled: !!tenant?.id && !!currentBrand?.id,
  });
}

export function useWebhookDeliveries(webhookId: string | null) {
  const { tenant, currentBrand } = useAuthStore();

  return useQuery<WebhookDelivery[]>({
    queryKey: queryKeys.webhooks.deliveries(webhookId || ''),
    queryFn: () =>
      webhooksApi.listDeliveries(requireTenantId(tenant), requireBrandId(currentBrand), webhookId!),
    enabled: !!tenant?.id && !!currentBrand?.id && !!webhookId,
  });
}

export function useCreateWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: {
      name: string;
      url: string;
      events: string[];
      direction?: string;
      headers?: Record<string, string>;
    }) => webhooksApi.create(requireTenantId(tenant), requireBrandId(currentBrand), data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      showToast({
        variant: 'success',
        title: 'Webhook created',
        message: `Created webhook "${variables.name}".`,
      });
      useAuditLogStore
        .getState()
        .log('webhook.created', `Created webhook "${variables.name}"`, { url: variables.url });
    },
    onError: (error: unknown) => {
      showToast({
        variant: 'error',
        title: 'Failed to create webhook',
        message: getErrorMessage(error),
      });
    },
  });
}

export function useUpdateWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({
      webhookId,
      data,
    }: {
      webhookId: string;
      data: Partial<{
        name: string;
        url: string;
        events: string[];
        status: string;
        headers: Record<string, string>;
      }>;
    }) =>
      webhooksApi.update(requireTenantId(tenant), requireBrandId(currentBrand), webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      showToast({
        variant: 'success',
        title: 'Webhook updated',
        message: 'Webhook settings were saved.',
      });
    },
    onError: (error: unknown) => {
      showToast({
        variant: 'error',
        title: 'Failed to update webhook',
        message: getErrorMessage(error),
      });
    },
  });
}

export function useDeleteWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.delete(requireTenantId(tenant), requireBrandId(currentBrand), webhookId),
    onSuccess: (_result, webhookId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      showToast({
        variant: 'success',
        title: 'Webhook deleted',
        message: 'The webhook was removed.',
      });
      useAuditLogStore
        .getState()
        .log('webhook.deleted', `Deleted webhook ${webhookId}`, { webhookId });
    },
    onError: (error: unknown) => {
      showToast({
        variant: 'error',
        title: 'Failed to delete webhook',
        message: getErrorMessage(error),
      });
    },
  });
}

export function useTestWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.test(requireTenantId(tenant), requireBrandId(currentBrand), webhookId),
    onSuccess: (result) => {
      showToast({
        variant: result.success ? 'success' : 'warning',
        title: result.success ? 'Webhook test succeeded' : 'Webhook test failed',
        message:
          result.status_code !== null
            ? `Status ${result.status_code} in ${result.duration_ms}ms.`
            : `No response received after ${result.duration_ms}ms.`,
      });
    },
    onError: (error: unknown) => {
      showToast({
        variant: 'error',
        title: 'Webhook test failed',
        message: getErrorMessage(error),
      });
    },
  });
}
