import { useState, useEffect } from 'react';
import { Server, Copy, Check, Trash2, Loader2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../../stores/auth';
import { sandboxApi } from '../../../lib/sandbox';

export function SandboxSettings({ secureStorageAvailable }: { secureStorageAvailable: boolean }) {
  const { sandboxApiKey, setSandboxApiKey, clearSandboxApiKey } = useAuthStore();

  const [sandboxKeyInput, setSandboxKeyInput] = useState('');
  const [sandboxKeyCopied, setSandboxKeyCopied] = useState(false);
  const [sandboxHealthStatus, setSandboxHealthStatus] = useState<'unknown' | 'healthy' | 'error'>(
    'unknown'
  );
  const [isTestingSandbox, setIsTestingSandbox] = useState(false);
  const [isCreatingSandbox, setIsCreatingSandbox] = useState(false);
  const [sandboxCreateResult, setSandboxCreateResult] = useState<string | null>(null);
  const [sandboxHealthError, setSandboxHealthError] = useState<string | null>(null);

  const maskApiKey = (key: string) => {
    if (key.length <= 12) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  const copySandboxApiKey = () => {
    if (sandboxApiKey) {
      if (!navigator.clipboard?.writeText) return;
      void navigator.clipboard
        .writeText(sandboxApiKey)
        .then(() => {
          setSandboxKeyCopied(true);
          setTimeout(() => setSandboxKeyCopied(false), 2000);
        })
        .catch(() => {});
    }
  };

  const testSandboxConnection = async () => {
    setIsTestingSandbox(true);
    setSandboxHealthError(null);
    try {
      const health = await sandboxApi.health();
      setSandboxHealthStatus(health.status === 'healthy' ? 'healthy' : 'error');
    } catch (error) {
      setSandboxHealthStatus('error');
      setSandboxHealthError(
        error instanceof Error ? error.message : 'Failed to connect to sandbox API'
      );
    } finally {
      setIsTestingSandbox(false);
    }
  };

  const saveSandboxApiKey = async () => {
    if (sandboxKeyInput.trim()) {
      await setSandboxApiKey(sandboxKeyInput.trim());
      setSandboxKeyInput('');
      await testSandboxConnection();
    }
  };

  const removeSandboxApiKey = async () => {
    await clearSandboxApiKey();
    setSandboxHealthStatus('unknown');
    setSandboxHealthError(null);
    setSandboxCreateResult(null);
  };

  const createSandbox = async () => {
    setIsCreatingSandbox(true);
    setSandboxCreateResult(null);
    try {
      const sandbox = await sandboxApi.create();
      setSandboxCreateResult(
        `Created sandbox ${sandbox.sandbox_id} (${sandbox.pod_ip}) - startup: ${sandbox.startup_metrics?.total_ms}ms`
      );
    } catch (error) {
      setSandboxCreateResult(
        `Error: ${error instanceof Error ? error.message : 'Failed to create sandbox'}`
      );
    } finally {
      setIsCreatingSandbox(false);
    }
  };

  useEffect(() => {
    if (sandboxApiKey) {
      testSandboxConnection();
    }
  }, [sandboxApiKey]);

  return (
    <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
        <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
          <Server className="w-5 h-5 text-gray-400" aria-hidden="true" />
          Sandbox API
        </h2>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-sm text-gray-400">
          Configure your Sandbox API key to create and manage isolated Claude Code execution
          environments.
        </p>
        {!secureStorageAvailable && (
          <p className="text-xs text-amber-300">
            Secure storage is unavailable. Sandbox keys are kept in memory for this session only.
          </p>
        )}

        {sandboxApiKey ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Sandbox API Key
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-800 rounded-lg font-mono text-sm">
                  {maskApiKey(sandboxApiKey)}
                </code>
                <button
                  type="button"
                  onClick={copySandboxApiKey}
                  className={clsx(
                    'p-2 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0',
                    sandboxKeyCopied
                      ? 'bg-green-900/30 text-green-400 shadow-sm shadow-green-500/10'
                      : 'bg-gray-800 hover:bg-gray-700 hover:scale-105'
                  )}
                  title="Copy Sandbox API Key"
                  aria-label="Copy sandbox API key"
                >
                  {sandboxKeyCopied ? (
                    <Check className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Copy className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={removeSandboxApiKey}
                  className="p-2 bg-red-900/50 hover:bg-red-900 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-sm hover:shadow-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                  title="Remove Sandbox API Key"
                  aria-label="Remove sandbox API key"
                >
                  <Trash2 className="w-5 h-5 text-red-400" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Status:</span>
                {isTestingSandbox ? (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Testing...
                  </span>
                ) : sandboxHealthStatus === 'healthy' ? (
                  <span className="flex items-center gap-1.5 text-green-400">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
                    </span>
                    Connected
                  </span>
                ) : sandboxHealthStatus === 'error' ? (
                  <span className="text-red-400">Connection failed</span>
                ) : (
                  <span className="text-gray-500">Unknown</span>
                )}
                {sandboxHealthError ? (
                  <span
                    className="text-xs text-red-300 block mt-1 max-w-xs truncate"
                    title={sandboxHealthError}
                  >
                    {sandboxHealthError}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={testSandboxConnection}
                disabled={isTestingSandbox}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                aria-label="Test sandbox connection"
              >
                Test Connection
              </button>
            </div>

            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Create Sandbox</p>
                  <p className="text-sm text-gray-400">Spin up a new Claude Code sandbox pod</p>
                </div>
                <button
                  type="button"
                  onClick={createSandbox}
                  disabled={isCreatingSandbox || sandboxHealthStatus !== 'healthy'}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                  aria-label={isCreatingSandbox ? 'Creating sandbox' : 'Create sandbox'}
                >
                  {isCreatingSandbox ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Create Sandbox
                    </>
                  )}
                </button>
              </div>
              {sandboxCreateResult && (
                <p
                  className={clsx(
                    'mt-2 text-sm',
                    sandboxCreateResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'
                  )}
                >
                  {sandboxCreateResult}
                </p>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Add Sandbox API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={sandboxKeyInput}
                onChange={(e) => setSandboxKeyInput(e.target.value)}
                placeholder="sk_test_..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 font-mono text-sm transition-all focus-glow"
              />
              <button
                type="button"
                onClick={saveSandboxApiKey}
                disabled={!sandboxKeyInput.trim()}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Your Sandbox API key is stored securely and used to create isolated execution
              environments.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
