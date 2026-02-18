import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { secretsApi } from '../lib/api';
import { localSecretsApi } from '../lib/localSecrets';
import { getErrorMessage } from '../lib/errors';
import { queryKeys } from '../lib/queryKeys';
import { useToast } from '../components/ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { requireTenantId, requireBrandId } from '../lib/auth-guards';
import type { PlatformConnection } from '../types';
import { Plug, Check, AlertCircle, Loader2, Trash2, RefreshCw, Plus } from 'lucide-react';
import clsx from 'clsx';
import { usePageTitle } from '../hooks/usePageTitle';

interface Platform {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requiredFields: {
    key: string;
    label: string;
    type: string;
    required?: boolean;
  }[];
  oauth?: {
    provider: 'shopify' | 'gorgias' | 'zendesk';
    label: string;
    fields: { key: string; label: string; type: string; placeholder?: string }[];
  };
}

const CUSTOM_MCP_FIELDS: Platform['requiredFields'] = [
  { key: 'endpoint', label: 'MCP Endpoint / Command', type: 'text' },
  { key: 'auth_token', label: 'Auth Token (optional)', type: 'password', required: false },
];

const PLATFORMS: Platform[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'E-commerce platform for orders, products, and customers',
    icon: '🛍️',
    color: 'bg-green-600',
    requiredFields: [
      { key: 'shop_domain', label: 'Shop Domain', type: 'text' },
      { key: 'access_token', label: 'Access Token', type: 'password' },
    ],
    oauth: {
      provider: 'shopify',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'shop_domain',
          label: 'Shop Domain',
          type: 'text',
          placeholder: 'mystore.myshopify.com',
        },
      ],
    },
  },
  {
    id: 'gorgias',
    name: 'Gorgias',
    description: 'Customer support helpdesk for tickets and messaging',
    icon: '💬',
    color: 'bg-purple-600',
    requiredFields: [
      { key: 'domain', label: 'Gorgias Domain', type: 'text' },
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    oauth: {
      provider: 'gorgias',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'domain',
          label: 'Gorgias Domain',
          type: 'text',
          placeholder: 'your-domain',
        },
      ],
    },
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Customer service and support ticketing system',
    icon: '🎫',
    color: 'bg-emerald-600',
    requiredFields: [
      { key: 'subdomain', label: 'Zendesk Subdomain', type: 'text' },
      { key: 'api_token', label: 'API Token', type: 'password' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    oauth: {
      provider: 'zendesk',
      label: 'Connect with OAuth',
      fields: [
        {
          key: 'subdomain',
          label: 'Zendesk Subdomain',
          type: 'text',
          placeholder: 'your-subdomain',
        },
      ],
    },
  },
  {
    id: 'recharge',
    name: 'Recharge',
    description: 'Subscription management and recurring billing',
    icon: '🔄',
    color: 'bg-blue-600',
    requiredFields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
  },
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    description: 'Email marketing and customer data platform',
    icon: '📧',
    color: 'bg-gray-700',
    requiredFields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
  },
  {
    id: 'shipstation',
    name: 'ShipStation',
    description: 'Shipping and fulfillment management',
    icon: '📦',
    color: 'bg-amber-600',
    requiredFields: [
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'api_secret', label: 'API Secret', type: 'password' },
    ],
  },
];

type ConnectionInfo = PlatformConnection & { source: 'remote' | 'local' };

type ConnectionsResult = {
  connections: ConnectionInfo[];
  mode: 'remote' | 'local';
  vaultError?: string;
};

const BUILT_IN_PLATFORM_IDS = new Set(PLATFORMS.map((platform) => platform.id));

const normalizeCustomPlatformId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

function normalizeConnectionInput(fieldKey: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (fieldKey === 'shop_domain' || fieldKey === 'domain' || fieldKey === 'subdomain') {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  return trimmed;
}

function hasMissingOAuthInput(
  fields: { key: string; label: string; type: string; placeholder?: string }[],
  values: Record<string, string>
): boolean {
  return fields.some((field) => !normalizeConnectionInput(field.key, values[field.key] || ''));
}

function normalizeCredentials(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, normalizeConnectionInput(key, value)])
  );
}

function createCustomPlatformConfig(platformId: string): Platform {
  return {
    id: platformId,
    name: platformId,
    description: 'Custom MCP server',
    icon: '🧩',
    color: 'bg-indigo-600',
    requiredFields: CUSTOM_MCP_FIELDS,
  };
}

function isBuiltInPlatform(platformId: string): boolean {
  return BUILT_IN_PLATFORM_IDS.has(platformId);
}

function getPlatformConfig(platformId: string): Platform {
  return (
    PLATFORMS.find((platform) => platform.id === platformId) ??
    createCustomPlatformConfig(platformId)
  );
}

function hasMissingRequiredFields(platform: Platform, values: Record<string, string>): boolean {
  return platform.requiredFields.some(
    (field) =>
      field.required !== false && !normalizeConnectionInput(field.key, values[field.key] || '')
  );
}

function buildCredentialsForSave(
  platform: Platform,
  values: Record<string, string>
): Record<string, string> {
  const normalizedValues = normalizeCredentials(values);
  const requiredFields = platform.requiredFields.filter((field) => field.required !== false);
  const missingField = requiredFields.find(
    (field) => !normalizeConnectionInput(field.key, normalizedValues[field.key] || '')
  );

  if (missingField) {
    throw new Error(`Please provide ${missingField.label.toLowerCase()}.`);
  }

  return Object.fromEntries(
    Object.entries(normalizedValues).filter(([, value]) => value.length > 0)
  );
}

const isVaultNotConfigured = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('vault') && message.includes('not configured');
};

export default function Connections() {
  usePageTitle('Connections');
  const { tenant, currentBrand } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<'manual' | 'oauth' | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [oauthInputs, setOauthInputs] = useState<Record<string, string>>({});
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [showCustomServerForm, setShowCustomServerForm] = useState(false);
  const [customServerId, setCustomServerId] = useState('');
  const [customServerEndpoint, setCustomServerEndpoint] = useState('');
  const [customServerAuthToken, setCustomServerAuthToken] = useState('');

  const handleMutationError = useCallback(
    (title: string) => (error: unknown) => {
      showToast({
        variant: 'error',
        title,
        message: getErrorMessage(error),
      });
    },
    [showToast]
  );

  // Fetch connected platforms
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
          connections: connections.map((connection) => ({ ...connection, source: 'remote' })),
          mode: 'remote',
        };
      } catch (error) {
        if (isVaultNotConfigured(error)) {
          const localConnections = await localSecretsApi.listConnections(tid, bid);
          return {
            connections: localConnections.map((connection) => ({
              ...connection,
              source: 'local',
            })),
            mode: 'local',
            vaultError: getErrorMessage(error),
          };
        }
        throw error;
      }
    },
    enabled: !!tenant?.id && !!currentBrand?.id,
  });

  const connections = connectionsData?.connections ?? [];
  const connectionsMode = connectionsData?.mode ?? 'remote';
  const vaultError = connectionsData?.vaultError;
  const isLocalMode = connectionsMode === 'local';
  const connectedPlatformIds = new Set(connections.map((connection) => connection.platform));
  const displayedPlatforms = Array.from(
    new Set([...PLATFORMS.map((platform) => platform.id), ...connectedPlatformIds])
  )
    .map((platformId) => getPlatformConfig(platformId))
    .filter((platform) => platform.id)
    .sort((a, b) => {
      const aBuiltIn = isBuiltInPlatform(a.id);
      const bBuiltIn = isBuiltInPlatform(b.id);
      if (aBuiltIn === bBuiltIn) return a.name.localeCompare(b.name);
      return aBuiltIn ? -1 : 1;
    });

  useEffect(() => {
    if (connectionsError) {
      handleMutationError('Failed to load connections')(connectionsError);
    }
  }, [connectionsError, handleMutationError]);

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

  // Store credentials mutation
  const storeCredentials = useMutation({
    mutationFn: ({ platform, creds }: { platform: string; creds: Record<string, string> }) =>
      storeCredentialsFn(platform, creds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all });
      setConnectingPlatform(null);
      setConnectMode(null);
      setCredentials({});
      setOauthInputs({});
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

  // Test connection mutation
  const testConnection = useMutation({
    mutationFn: (platform: string) => testConnectionFn(platform),
  });

  // Delete credentials mutation
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

  const getConnection = (platformId: string) =>
    connections.find((c) => c.platform === platformId && c.connected);
  const isConnected = (platformId: string) => Boolean(getConnection(platformId));
  const isLocalConnection = (platformId: string) => getConnection(platformId)?.source === 'local';

  const resetConnectState = () => {
    setConnectingPlatform(null);
    setConnectMode(null);
    setCredentials({});
    setOauthInputs({});
  };

  const resetCustomServerForm = () => {
    setShowCustomServerForm(false);
    setCustomServerId('');
    setCustomServerEndpoint('');
    setCustomServerAuthToken('');
  };

  const startManualConnect = (platform: Platform) => {
    setConnectingPlatform(platform.id);
    setConnectMode('manual');
    setCredentials({});
  };

  const startOAuthConnect = (platform: Platform) => {
    setConnectingPlatform(platform.id);
    setConnectMode('oauth');
    setOauthInputs({});
  };

  const handleSaveCredentials = async (platform: Platform) => {
    if (hasMissingRequiredFields(platform, credentials)) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: `Please fill out all ${platform.name} credentials before saving.`,
      });
      return;
    }
    await storeCredentials.mutateAsync({
      platform: platform.id,
      creds: credentials,
    });
  };

  const handleAddCustomServer = async () => {
    const platformId = normalizeCustomPlatformId(customServerId);
    if (!platformId) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: 'Please provide a server identifier.',
      });
      return;
    }
    if (!customServerEndpoint.trim()) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: 'Please provide an MCP endpoint or command.',
      });
      return;
    }
    if (platformId.length < 3) {
      showToast({
        variant: 'error',
        title: 'Invalid server id',
        message: 'Server identifier should be at least 3 characters long.',
      });
      return;
    }

    const creds: Record<string, string> = { endpoint: customServerEndpoint.trim() };
    if (customServerAuthToken.trim()) {
      creds.auth_token = customServerAuthToken.trim();
    }

    await storeCredentials.mutateAsync({
      platform: platformId,
      creds,
    });
    resetCustomServerForm();
    showToast({
      variant: 'success',
      title: 'Custom MCP server added',
      message: `${platformId} is now available for agent configuration.`,
    });
  };

  const handleOAuthConnect = async (platform: Platform) => {
    if (!platform.oauth) return;
    if (!window.electronAPI) {
      showToast({
        variant: 'error',
        title: 'OAuth unavailable',
        message: 'OAuth connections are only available in the desktop app.',
      });
      return;
    }

    const field = platform.oauth.fields[0];
    const value = normalizeConnectionInput(field.key, oauthInputs[field.key] || '');

    if (!value || hasMissingOAuthInput(platform.oauth.fields, oauthInputs)) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: `Please enter your ${field.label.toLowerCase()}.`,
      });
      return;
    }

    try {
      setOauthInputs((prev) => ({
        ...prev,
        [field.key]: value,
      }));

      const result = await window.electronAPI.oauth[platform.oauth.provider].start(value);

      if (!result || typeof result !== 'object') {
        throw new Error('OAuth provider returned invalid credentials.');
      }

      const credentials = result as Record<string, unknown>;
      if (
        Object.entries(credentials).some(
          ([, credentialValue]) =>
            typeof credentialValue !== 'string' || !credentialValue.trim().length
        )
      ) {
        throw new Error('OAuth provider returned incomplete credentials.');
      }

      await storeCredentials.mutateAsync({
        platform: platform.id,
        creds: credentials as Record<string, string>,
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'OAuth failed',
        message: getErrorMessage(error),
      });
    }
  };

  const handleTest = async (platformId: string) => {
    if (isLocalMode) {
      showToast({
        variant: 'info',
        title: 'Local storage active',
        message: 'Vault is not configured, so connection tests are unavailable.',
      });
      return;
    }
    setTestingPlatform(platformId);
    try {
      const result = await testConnection.mutateAsync(platformId);
      showToast({
        variant: result.success ? 'success' : 'error',
        title: result.success ? 'Connection successful' : 'Connection failed',
        message: result.message,
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Connection test failed',
        message: getErrorMessage(error),
      });
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    const platform = getPlatformConfig(platformId);
    const confirmed = await confirm({
      title: `Disconnect ${platform?.name || 'Platform'}?`,
      message:
        'This will remove the stored credentials. Any agents using this platform will no longer have access.',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (confirmed) {
      await deleteCredentials.mutateAsync(platformId);
    }
  };

  if (!currentBrand) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
        <p className="text-lg">Please select a brand first</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Platform Connections</h1>
        <p className="text-gray-400 mt-1">Connect your platforms to enable AI agent access</p>
      </div>

      {/* Info banner */}
      {isLocalMode ? (
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-800 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-200">
                Vault is not configured on the backend. Credentials are stored locally on this
                device and are not available to cloud agents.
              </p>
              {vaultError && <p className="text-xs text-amber-300 mt-2">{vaultError}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-xl">
          <div className="flex items-start gap-3">
            <Plug className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-200">
                Credentials are securely stored in our vault and only accessible by your AI agents.
                They are never logged or exposed.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Configured Connections</h2>
          <p className="text-sm text-gray-400 mt-1">Manage built-ins and custom MCP servers</p>
        </div>
        <button
          onClick={() => setShowCustomServerForm((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add custom MCP server
        </button>
      </div>

      {showCustomServerForm && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="font-semibold mb-3">Add custom MCP server</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-sm text-gray-400">Server identifier</span>
              <input
                type="text"
                value={customServerId}
                placeholder="my-mcp-server"
                onChange={(e) => setCustomServerId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-gray-400">Endpoint / Command</span>
              <input
                type="text"
                value={customServerEndpoint}
                placeholder="https://... or custom command"
                onChange={(e) => setCustomServerEndpoint(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm text-gray-400">Auth token (optional)</span>
              <input
                type="password"
                value={customServerAuthToken}
                placeholder="Optional API key or token"
                onChange={(e) => setCustomServerAuthToken(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleAddCustomServer}
              disabled={storeCredentials.isPending}
              className="px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {storeCredentials.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                'Add server'
              )}
            </button>
            <button
              onClick={resetCustomServerForm}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Platforms grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayedPlatforms.map((platform) => {
            const connected = isConnected(platform.id);
            const isLocal = isLocalConnection(platform.id);
            const isConnecting = connectingPlatform === platform.id;
            const isManual = isConnecting && connectMode === 'manual';
            const isOAuth = isConnecting && connectMode === 'oauth';
            const disableTest = testingPlatform === platform.id || isLocalMode;
            const isBuiltIn = isBuiltInPlatform(platform.id);

            return (
              <div
                key={platform.id}
                className={clsx(
                  'bg-gray-900 border rounded-xl overflow-hidden transition-colors',
                  connected ? 'border-green-600/50' : 'border-gray-800'
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={clsx(
                          'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                          platform.color
                        )}
                      >
                        {platform.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{platform.name}</h3>
                          {connected && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full">
                              <Check className="w-3 h-3" />
                              Connected
                            </span>
                          )}
                          {!isBuiltIn && (
                            <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">
                              Custom
                            </span>
                          )}
                          {isLocal && (
                            <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 text-xs rounded-full">
                              Local
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{platform.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Connection form */}
                  {isManual && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="space-y-3">
                        {platform.requiredFields.map((field) => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              {field.label}
                            </label>
                            <input
                              type={field.type}
                              value={credentials[field.key] || ''}
                              onChange={(e) =>
                                setCredentials((prev) => ({
                                  ...prev,
                                  [field.key]: normalizeConnectionInput(field.key, e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          onClick={() => handleSaveCredentials(platform)}
                          disabled={
                            storeCredentials.isPending ||
                            hasMissingRequiredFields(platform, credentials)
                          }
                          className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors"
                        >
                          {storeCredentials.isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                          ) : (
                            'Save'
                          )}
                        </button>
                        <button
                          onClick={resetConnectState}
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {isOAuth && platform.oauth && (
                    <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
                      {platform.oauth.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-300 mb-1">
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            value={oauthInputs[field.key] || ''}
                            onChange={(e) =>
                              setOauthInputs((prev) => ({
                                ...prev,
                                [field.key]: normalizeConnectionInput(field.key, e.target.value),
                              }))
                            }
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOAuthConnect(platform)}
                          disabled={
                            storeCredentials.isPending ||
                            (platform.oauth
                              ? hasMissingOAuthInput(platform.oauth.fields, oauthInputs)
                              : false)
                          }
                          className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors"
                        >
                          {storeCredentials.isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                          ) : (
                            platform.oauth.label
                          )}
                        </button>
                        <button
                          onClick={resetConnectState}
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!isConnecting && (
                    <div className="flex items-center gap-2 mt-4">
                      {connected ? (
                        <>
                          <button
                            onClick={() => handleTest(platform.id)}
                            disabled={disableTest}
                            title={
                              isLocalMode
                                ? 'Local credentials cannot be tested without a configured vault.'
                                : 'Test connection'
                            }
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {testingPlatform === platform.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            Test
                          </button>
                          <button
                            onClick={() => handleDisconnect(platform.id)}
                            title={`Disconnect ${platform.name}`}
                            aria-label={`Disconnect ${platform.name}`}
                            className="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              platform.oauth
                                ? startOAuthConnect(platform)
                                : startManualConnect(platform)
                            }
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Plug className="w-4 h-4" />
                            {platform.oauth ? platform.oauth.label : 'Connect'}
                          </button>
                          {platform.oauth && (
                            <button
                              onClick={() => startManualConnect(platform)}
                              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                            >
                              Manual
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      {ConfirmDialogComponent}
    </div>
  );
}
