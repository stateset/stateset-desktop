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
    try {
      const health = await sandboxApi.health();
      setSandboxHealthStatus(health.status === 'healthy' ? 'healthy' : 'error');
    } catch {
      setSandboxHealthStatus('error');
    } finally {
      setIsTestingSandbox(false);
    }
  };

  const saveSandboxApiKey = async () => {
    if (sandboxKeyInput.trim()) {
      await setSandboxApiKey(sandboxKeyInput.trim());
      setSandboxKeyInput('');
      testSandboxConnection();
    }
  };

  const removeSandboxApiKey = async () => {
    await clearSandboxApiKey();
    setSandboxHealthStatus('unknown');
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
    <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold flex items-center gap-2">
          <Server className="w-5 h-5 text-gray-400" />
          Sandbox API
        </h2>
      </div>
      <div className="p-4 space-y-4">
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
                  onClick={copySandboxApiKey}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Copy Sandbox API Key"
                  aria-label="Copy sandbox API key"
                >
                  {sandboxKeyCopied ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={removeSandboxApiKey}
                  className="p-2 bg-red-900/50 hover:bg-red-900 rounded-lg transition-colors"
                  title="Remove Sandbox API Key"
                  aria-label="Remove sandbox API key"
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Status:</span>
                {isTestingSandbox ? (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing...
                  </span>
                ) : sandboxHealthStatus === 'healthy' ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <Check className="w-4 h-4" />
                    Connected
                  </span>
                ) : sandboxHealthStatus === 'error' ? (
                  <span className="text-red-400">Connection failed</span>
                ) : (
                  <span className="text-gray-500">Unknown</span>
                )}
              </div>
              <button
                onClick={testSandboxConnection}
                disabled={isTestingSandbox}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
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
                  onClick={createSandbox}
                  disabled={isCreatingSandbox || sandboxHealthStatus !== 'healthy'}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  {isCreatingSandbox ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
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
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 font-mono text-sm"
              />
              <button
                onClick={saveSandboxApiKey}
                disabled={!sandboxKeyInput.trim()}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
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
