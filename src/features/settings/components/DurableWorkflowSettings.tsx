import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Network, Trash2, XCircle } from 'lucide-react';
import { durableWorkflowApi } from '../../../lib/durableWorkflows';
import { useAuthStore } from '../../../stores/auth';
import { useDurableWorkflowsStore } from '../../../stores/durableWorkflows';

export function DurableWorkflowSettings() {
  const tenant = useAuthStore((state) => state.tenant);
  const { initialized, engineUrl, apiKey, initialize, setConfiguration, clearApiKey } =
    useDurableWorkflowsStore();
  const [urlInput, setUrlInput] = useState(engineUrl);
  const [keyInput, setKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (initialized) setUrlInput(engineUrl);
  }, [engineUrl, initialized]);

  const save = async () => {
    setIsSaving(true);
    setResult(null);
    try {
      await setConfiguration(urlInput, keyInput || undefined);
      setKeyInput('');
      setResult({ ok: true, message: 'Durable workflow configuration saved.' });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const test = async () => {
    if (!tenant?.id) return;
    setIsTesting(true);
    setResult(null);
    try {
      await durableWorkflowApi.health(tenant.id);
      setResult({ ok: true, message: 'Durable workflow engine is reachable.' });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
        <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
          <Network className="w-5 h-5 text-brand-400" aria-hidden="true" />
          Durable Workflow Engine
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Submit work to Temporal so it continues after this app closes or restarts.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-300">Engine URL</span>
          <input
            type="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            className="mt-1.5 w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-brand-500"
            placeholder="https://api.workstream.stateset.com"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> API key
          </span>
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            className="mt-1.5 w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-brand-500"
            placeholder={apiKey ? 'Stored securely — enter a new key to replace it' : 'Required'}
            autoComplete="off"
          />
          <span className="text-xs text-gray-500 mt-1 block">
            {apiKey
              ? 'A key is stored in the operating system credential store.'
              : 'No key stored.'}
          </span>
        </label>

        {result && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              result.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            )}
            {result.message}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isSaving || !urlInput.trim() || (!apiKey && !keyInput.trim())}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-sm font-medium"
          >
            {isSaving ? 'Saving…' : 'Save configuration'}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={isTesting || !apiKey || !tenant?.id}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            {isTesting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Test connection
          </button>
          {apiKey && (
            <button
              type="button"
              onClick={() => void clearApiKey()}
              className="px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/10 text-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove key
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
