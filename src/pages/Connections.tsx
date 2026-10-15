import { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../components/ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { usePageTitle } from '../hooks/usePageTitle';
import { getErrorMessage } from '../lib/errors';
import { useConnections } from '../features/connections/hooks/useConnections';
import { useConnectionMutations } from '../features/connections/hooks/useConnectionMutations';
import { useMcpVerifications } from '../features/connections/hooks/useMcpVerifications';
import { useVerifyAllMcpServers } from '../features/connections/hooks/useVerifyAllMcpServers';
import { PlatformCard } from '../features/connections/components/PlatformCard';
import { CustomMcpForm } from '../features/connections/components/CustomMcpForm';
import { LocalMcpServerCard } from '../features/connections/components/LocalMcpServerCard';
import { McpProbeButton } from '../features/connections/components/McpProbeButton';
import { McpToolCatalog } from '../features/connections/components/McpToolCatalog';
import { useMcpServerOptions } from '../features/connections/hooks/useMcpServerOptions';
import {
  normalizeConnectionInput,
  hasMissingRequiredFields,
  hasMissingOAuthInput,
  getPlatformConfig,
  isBuiltInPlatform,
} from '../features/connections/utils';
import type { Platform } from '../features/connections/platforms';
import type { McpProbeResult } from '../vite-env';
import {
  STATESET_HTTP_MCP_SERVERS,
  STATESET_STDIO_MCP_SERVERS,
  buildStatesetMcpCredentials,
  getStatesetHttpMcpServer,
} from '../features/connections/statesetMcpServers';
import { Plug, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Spinner } from '../components/Spinner';
import {
  pageContainerVariants,
  pageSectionVariants,
  listContainerVariants,
  listItemVariants,
} from '../lib/animations';

export default function Connections() {
  usePageTitle('Connections');
  const reduceMotion = useReducedMotion();
  const { tenant, currentBrand } = useAuthStore();
  const { showToast } = useToast();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const { isLoading, isLocalMode, vaultError, displayedPlatforms, isConnected, isLocalConnection } =
    useConnections();

  const { storeCredentials, testConnection, deleteCredentials } =
    useConnectionMutations(isLocalMode);
  const {
    verifications,
    record: recordVerification,
    forget: forgetVerification,
  } = useMcpVerifications(currentBrand?.id ?? '');
  const mcpServerOptions = useMcpServerOptions();
  const { verifyAll, isVerifying } = useVerifyAllMcpServers({
    tenantId: tenant?.id ?? '',
    brandId: currentBrand?.id ?? '',
    record: recordVerification,
    forget: forgetVerification,
  });

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<'manual' | 'oauth' | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [oauthInputs, setOauthInputs] = useState<Record<string, string>>({});
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [showCustomServerForm, setShowCustomServerForm] = useState(false);
  // A pre-save handshake belongs to credentials that may never be saved; hold
  // it until they are.
  const [pendingVerification, setPendingVerification] = useState<{
    platformId: string;
    result: Extract<McpProbeResult, { ok: true }>;
  } | null>(null);

  const resetConnectState = useCallback(() => {
    setConnectingPlatform(null);
    setConnectMode(null);
    setCredentials({});
    setOauthInputs({});
    setPendingVerification(null);
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
    const statesetServer = getStatesetHttpMcpServer(platform.id);
    try {
      const creds = statesetServer
        ? buildStatesetMcpCredentials(statesetServer, credentials)
        : credentials;
      await storeCredentials.mutateAsync({ platform: platform.id, creds });
      if (pendingVerification?.platformId === platform.id) {
        await recordVerification(platform.id, pendingVerification.result);
      }
      resetConnectState();
    } catch (error) {
      // A rejected save is reported by the mutation's onError, but a failure to
      // build the credentials has nobody else to report it.
      if (!storeCredentials.isError) {
        showToast({ variant: 'error', title: 'Missing info', message: getErrorMessage(error) });
      }
      // Keep the form open either way so the user can correct the credentials.
    }
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
    setTestingPlatform(platformId);
    try {
      const result = await testConnection.mutateAsync(platformId);
      // A local test runs a real handshake; keep what it learned, and drop a
      // stored claim the server just disproved.
      if (result.probe?.ok) {
        await recordVerification(platformId, result.probe);
      } else if (result.probe && !result.probe.ok && !result.probe.unreachable) {
        // The server answered and contradicted what we stored; an unreachable
        // server proves nothing, so its record stays.
        await forgetVerification(platformId);
      }
      const nothingTested = result.tested === false;
      showToast({
        variant: nothingTested ? 'info' : result.success ? 'success' : 'error',
        title: nothingTested
          ? 'Nothing to test'
          : result.success
            ? 'Connection successful'
            : 'Connection failed',
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
      try {
        await deleteCredentials.mutateAsync(platformId);
        // The stored handshake describes credentials that no longer exist.
        await forgetVerification(platformId);
      } catch {
        // Reported by the mutation's onError; the connection stays as it was.
      }
    }
  };

  const handleVerifyAll = async () => {
    const summary = await verifyAll();
    if (summary.error) {
      showToast({ variant: 'error', title: 'Could not test servers', message: summary.error });
      return;
    }
    if (summary.unavailable) {
      showToast({
        variant: 'info',
        title: 'Testing unavailable',
        message: 'Server tests are only available in the desktop app.',
      });
      return;
    }
    if (summary.total === 0) {
      showToast({
        variant: 'info',
        title: 'Nothing to test',
        message: 'No MCP servers are stored on this device.',
      });
      return;
    }
    showToast({
      variant: summary.failed > 0 ? 'error' : 'success',
      title: 'Servers tested',
      message: `${summary.verified} of ${summary.total} responded${
        summary.failed > 0 ? `, ${summary.failed} failed` : ''
      }.`,
    });
  };

  const handleAddCustomServer = async (platformId: string, creds: Record<string, string>) => {
    // Let the form keep its values if this fails; the mutation toasts the error.
    await storeCredentials.mutateAsync({ platform: platformId, creds });
    setShowCustomServerForm(false);
  };

  // Hosted StateSet servers can be verified with a live MCP handshake before saving.
  const renderProbeButton = (platform: Platform) => {
    const server = getStatesetHttpMcpServer(platform.id);
    if (!server) return null;
    try {
      const creds = buildStatesetMcpCredentials(server, credentials);
      return (
        <McpProbeButton
          endpoint={creds.endpoint}
          authToken={creds.auth_token}
          onVerified={(result) => setPendingVerification({ platformId: platform.id, result })}
        />
      );
    } catch {
      // Required fields are still missing — render the disabled state.
      return <McpProbeButton endpoint="" />;
    }
  };

  const renderPlatformCard = (platform: Platform) => (
    <motion.div key={platform.id} variants={reduceMotion ? undefined : listItemVariants}>
      <PlatformCard
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
        disableTest={testingPlatform === platform.id}
        formExtra={renderProbeButton(platform)}
        verification={isConnected(platform.id) ? verifications[platform.id] : undefined}
        onCredentialChange={(key, value) => {
          setPendingVerification(null);
          setCredentials((prev) => ({
            ...prev,
            [key]: normalizeConnectionInput(key, value),
          }));
        }}
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
    </motion.div>
  );

  if (!currentBrand) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
        <p className="text-lg">Please select a brand first</p>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-4xl mx-auto">
      <motion.div
        variants={reduceMotion ? undefined : pageContainerVariants}
        initial={reduceMotion ? undefined : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
      >
        {/* Header */}
        <motion.div variants={reduceMotion ? undefined : pageSectionVariants} className="mb-6">
          <h1 className="page-title">Platform Connections</h1>
          <p className="page-subtitle">Connect your platforms to enable AI agent access</p>
        </motion.div>

        {/* Info banner */}
        {isLocalMode ? (
          <div className="mb-6 p-4 ui-notice ui-notice-warning border rounded-xl backdrop-blur-sm shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm">
                  Vault is not configured on the backend. Credentials are stored locally on this
                  device and are not available to cloud agents.
                </p>
                {vaultError && <p className="text-xs mt-2">{vaultError}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 ui-notice ui-notice-info border rounded-xl backdrop-blur-sm shadow-sm">
            <div className="flex items-start gap-3">
              <Plug className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm">
                  Credentials are securely stored in our vault and only accessible by your AI
                  agents. They are never logged or exposed.
                </p>
              </div>
            </div>
          </div>
        )}

        <McpToolCatalog servers={mcpServerOptions} />

        <motion.section
          variants={reduceMotion ? undefined : pageSectionVariants}
          className="mb-8"
          aria-labelledby="stateset-mcp-heading"
        >
          <div className="mb-4">
            <h2 id="stateset-mcp-heading" className="text-lg font-semibold">
              StateSet MCP servers
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Hosted servers connect with an API key. Local servers run on your machine through an
              MCP client such as Claude Desktop or Cursor.
            </p>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" color="border-t-brand-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {STATESET_HTTP_MCP_SERVERS.map(renderPlatformCard)}
              {STATESET_STDIO_MCP_SERVERS.map((server) => (
                <LocalMcpServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </motion.section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Configured Connections</h2>
            <p className="text-sm text-gray-400 mt-1">Manage built-ins and custom MCP servers</p>
          </div>
          <div className="flex items-center gap-2">
            {isLocalMode && (
              <button
                type="button"
                onClick={handleVerifyAll}
                disabled={isVerifying}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              >
                {isVerifying ? (
                  <Spinner size="sm" color="border-t-brand-500" />
                ) : (
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                )}
                Test all servers
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCustomServerForm((prev) => !prev)}
              aria-label="Add custom MCP server"
              className="ui-button ui-button-primary inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add custom MCP server
            </button>
          </div>
        </div>

        {showCustomServerForm && (
          <CustomMcpForm
            isStoring={storeCredentials.isPending}
            onAdd={handleAddCustomServer}
            onCancel={() => setShowCustomServerForm(false)}
            onVerified={(platformId, result) => void recordVerification(platformId, result)}
          />
        )}

        {/* Platforms grid */}
        <motion.div variants={reduceMotion ? undefined : pageSectionVariants}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" color="border-t-brand-500" />
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 gap-4"
              variants={reduceMotion ? undefined : listContainerVariants}
              initial={reduceMotion ? undefined : 'hidden'}
              animate={reduceMotion ? undefined : 'visible'}
            >
              {displayedPlatforms.map(renderPlatformCard)}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
      {ConfirmDialogComponent}
    </div>
  );
}
