import { useState } from 'react';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { localSecretsApi } from '../../lib/localSecrets';
import { POLICY_API_URL, POLICY_CONNECTION } from './api';

interface Props {
  tenantId: string;
  brandId: string;
  onError: (message: string) => void;
}

export function ComputerChatSettings({ tenantId, brandId, onError }: Props) {
  const [sandboxKey, setSandboxKey] = useState('');
  const [workflowKey, setWorkflowKey] = useState('');
  const [policyKey, setPolicyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const engineUrl = useDurableWorkflowsStore((s) => s.engineUrl);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (sandboxKey.trim()) await useAuthStore.getState().setSandboxApiKey(sandboxKey.trim());
      if (workflowKey.trim())
        await useDurableWorkflowsStore.getState().setConfiguration(engineUrl, workflowKey.trim());
      if (policyKey.trim())
        await localSecretsApi.storeCredentials(tenantId, brandId, POLICY_CONNECTION, {
          api_key: policyKey.trim(),
        });
      setSandboxKey('');
      setWorkflowKey('');
      setPolicyKey('');
      setSaved(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-700/50 bg-slate-950/30 p-3 text-sm">
      <summary className="cursor-pointer text-gray-300">Chat settings</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-xs text-gray-400">
          Sandbox API key
          <input
            type="password"
            autoComplete="off"
            value={sandboxKey}
            onChange={(e) => setSandboxKey(e.target.value)}
            placeholder="Keep saved key"
            className="minimal-input mt-1 w-full"
          />
        </label>
        <label className="text-xs text-gray-400">
          Workflow API key
          <input
            type="password"
            autoComplete="off"
            value={workflowKey}
            onChange={(e) => setWorkflowKey(e.target.value)}
            placeholder="Keep saved key"
            className="minimal-input mt-1 w-full"
          />
        </label>
        <label className="text-xs text-gray-400">
          NSR policy API key
          <input
            type="password"
            autoComplete="off"
            value={policyKey}
            onChange={(e) => setPolicyKey(e.target.value)}
            placeholder="Keep saved key"
            className="minimal-input mt-1 w-full"
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Workflow engine: {engineUrl} · Policy engine: {POLICY_API_URL}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        The sandbox organization must have an ANTHROPIC_API_KEY secret. Durable actions require an
        outbound sandbox connector in the workflow engine for this brand.
      </p>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !(sandboxKey.trim() || workflowKey.trim() || policyKey.trim())}
        className="minimal-primary-button mt-3"
      >
        {saving ? 'Saving…' : 'Save keys'}
      </button>
      {saved && (
        <span role="status" className="ml-3 text-xs text-emerald-400">
          Keys saved
        </span>
      )}
    </details>
  );
}
