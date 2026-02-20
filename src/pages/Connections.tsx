import { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../components/ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { usePageTitle } from '../hooks/usePageTitle';
import { getErrorMessage } from '../lib/errors';
import { useConnections } from '../features/connections/hooks/useConnections';
import { useConnectionMutations } from '../features/connections/hooks/useConnectionMutations';
import { PlatformCard } from '../features/connections/components/PlatformCard';
import { CustomMcpForm } from '../features/connections/components/CustomMcpForm';
import {
  normalizeConnectionInput,
  hasMissingRequiredFields,
  hasMissingOAuthInput,
  getPlatformConfig,
  isBuiltInPlatform,
} from '../features/connections/utils';
import type { Platform } from '../features/connections/platforms';
import { Plug, AlertCircle, Loader2, Plus } from 'lucide-react';

export default function Connections() {
  usePageTitle('Connections');
  const { currentBrand } = useAuthStore();
  const { showToast } = useToast();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const { isLoading, isLocalMode, vaultError, displayedPlatforms, isConnected, isLocalConnection } =
    useConnections();

  const { storeCredentials, testConnection, deleteCredentials } =
    useConnectionMutations(isLocalMode);

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<'manual' | 'oauth' | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [oauthInputs, setOauthInputs] = useState<Record<string, string>>({});
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [showCustomServerForm, setShowCustomServerForm] = useState(false);

  const resetConnectState = useCallback(() => {
    setConnectingPlatform(null);
    setConnectMode(null);
    setCredentials({});
    setOauthInputs({});
  }, []);

  const handleSaveCredentials = async (platform: Platform) => {
    if (hasMissingRequiredFields(platform, credentials)) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: `Please fill out all ${platform.name} credentials before saving.`,
      });
      return;
    }
    await storeCredentials.mutateAsync({ platform: platform.id, creds: credentials });
    resetConnectState();
  };

  const handleOAuthConnect = async (platform: Platform) => {
    if (!platform.oauth || !window.electronAPI) {
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
      setOauthInputs((prev) => ({ ...prev, [field.key]: value }));
      const result = await window.electronAPI.oauth[platform.oauth.provider].start(value);
      if (!result || typeof result !== 'object') {
        throw new Error('OAuth provider returned invalid credentials.');
      }
      const creds = result as Record<string, unknown>;
      if (Object.entries(creds).some(([, v]) => typeof v !== 'string' || !v.trim().length)) {
        throw new Error('OAuth provider returned incomplete credentials.');
      }
      await storeCredentials.mutateAsync({
        platform: platform.id,
        creds: creds as Record<string, string>,
      });
      resetConnectState();
    } catch (error) {
      showToast({ variant: 'error', title: 'OAuth failed', message: getErrorMessage(error) });
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

  const handleAddCustomServer = async (platformId: string, creds: Record<string, string>) => {
    await storeCredentials.mutateAsync({ platform: platformId, creds });
    setShowCustomServerForm(false);
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
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-800 rounded-xl backdrop-blur-sm">
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
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-xl backdrop-blur-sm">
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Configured Connections</h2>
          <p className="text-sm text-gray-400 mt-1">Manage built-ins and custom MCP servers</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCustomServerForm((prev) => !prev)}
          aria-label="Add custom MCP server"
          className="inline-flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm border border-brand-600/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add custom MCP server
        </button>
      </div>

      {showCustomServerForm && (
        <CustomMcpForm
          isStoring={storeCredentials.isPending}
          onAdd={handleAddCustomServer}
          onCancel={() => setShowCustomServerForm(false)}
        />
      )}

      {/* Platforms grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayedPlatforms.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connected={isConnected(platform.id)}
              isLocal={isLocalConnection(platform.id)}
              isBuiltIn={isBuiltInPlatform(platform.id)}
              isConnecting={connectingPlatform === platform.id}
              connectMode={connectingPlatform === platform.id ? connectMode : null}
              credentials={credentials}
              oauthInputs={oauthInputs}
              isStoring={storeCredentials.isPending}
              isTesting={testingPlatform === platform.id}
              disableTest={testingPlatform === platform.id || isLocalMode}
              isLocalMode={isLocalMode}
              onCredentialChange={(key, value) =>
                setCredentials((prev) => ({
                  ...prev,
                  [key]: normalizeConnectionInput(key, value),
                }))
              }
              onOauthInputChange={(key, value) =>
                setOauthInputs((prev) => ({
                  ...prev,
                  [key]: normalizeConnectionInput(key, value),
                }))
              }
              onSaveCredentials={() => handleSaveCredentials(platform)}
              onOAuthConnect={() => handleOAuthConnect(platform)}
              onStartManual={() => {
                setConnectingPlatform(platform.id);
                setConnectMode('manual');
                setCredentials({});
              }}
              onStartOAuth={() => {
                setConnectingPlatform(platform.id);
                setConnectMode('oauth');
                setOauthInputs({});
              }}
              onCancel={resetConnectState}
              onTest={() => handleTest(platform.id)}
              onDisconnect={() => handleDisconnect(platform.id)}
            />
          ))}
        </div>
      )}

      {ConfirmDialogComponent}
    </div>
  );
}
