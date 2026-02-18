import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { useAuditLogStore } from '../../../stores/auditLog';
import { webhooksApi } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
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
      useAuditLogStore
        .getState()
        .log('webhook.created', `Created webhook "${variables.name}"`, { url: variables.url });
    },
  });
}

export function useUpdateWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();

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
    },
  });
}

export function useDeleteWebhook() {
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.delete(requireTenantId(tenant), requireBrandId(currentBrand), webhookId),
    onSuccess: (_result, webhookId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      useAuditLogStore
        .getState()
        .log('webhook.deleted', `Deleted webhook ${webhookId}`, { webhookId });
    },
  });
}

export function useTestWebhook() {
  const { tenant, currentBrand } = useAuthStore();

  return useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.test(requireTenantId(tenant), requireBrandId(currentBrand), webhookId),
  });
}
