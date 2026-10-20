import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { normalizeSandboxApiKey, useAuthStore } from '../../stores/auth';
import { localSecretsApi } from '../../lib/localSecrets';
import { useSecureStorageAvailability } from '../../hooks/useSecureStorageAvailability';
import { POLICY_CONNECTION } from './api';
import { SandboxConnectionCheck } from './SandboxConnectionCheck';

type SavedPolicyKey = 'loading' | 'saved' | 'missing' | 'unavailable';
const hasControlCharacters = (value: string) =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );

export function SandboxChatSetup({
  tenantId,
  brandId,
  onError,
}: {
  tenantId: string;
  brandId: string;
  onError: (message: string) => void;
}) {
  const savedKey = useAuthStore((state) => Boolean(state.sandboxApiKey));
  const secureStorage = useSecureStorageAvailability();
  const [policyStatus, setPolicyStatus] = useState<SavedPolicyKey>('loading');
  const [key, setKey] = useState('');
  const [policyKey, setPolicyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const readVersion = useRef(0);
  const scope = JSON.stringify([tenantId, brandId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const keyHint = useId();
  const policyHint = useId();
  const issueId = useId();
  const invalidSandbox = Boolean(
    key.trim() &&
    (!normalizeSandboxApiKey(key) || hasControlCharacters(key.trim()) || key.trim().length > 4096)
  );
  const invalidPolicy = Boolean(
    policyKey.trim() && (hasControlCharacters(policyKey.trim()) || policyKey.trim().length > 4096)
  );

  useEffect(() => {
    alive.current = true;
    const version = ++readVersion.current;
    setPolicyStatus('loading');
    setSaved(false);
    setKey('');
    setPolicyKey('');
    void localSecretsApi.getCredentials(tenantId, brandId, POLICY_CONNECTION).then(
      (credentials) => {
        if (alive.current && readVersion.current === version)
          setPolicyStatus(credentials?.api_key?.trim() ? 'saved' : 'missing');
      },
      () => {
        if (alive.current && readVersion.current === version) setPolicyStatus('unavailable');
      }
    );
    return () => {
      alive.current = false;
    };
  }, [tenantId, brandId]);

  const save = async () => {
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return (
        alive.current &&
        currentScope.current === scope &&
        auth.tenant?.id === tenantId &&
        auth.currentBrand?.id === brandId
      );
    };
    if (inFlight.current || !isCurrent() || invalidSandbox || invalidPolicy) return;
    const sandboxValue = key.trim();
    const policyValue = policyKey.trim();
    if (!sandboxValue && !policyValue) return;
    inFlight.current = true;
    setSaving(true);
    setSaved(false);
    onError('');
    let sandboxSaved = false;
    try {
      if (sandboxValue) {
        await useAuthStore.getState().setSandboxApiKey(sandboxValue);
        sandboxSaved = true;
        if (!isCurrent()) return;
        setKey('');
      }
      if (policyValue) {
        if (!isCurrent()) return;
        await localSecretsApi.storeCredentials(tenantId, brandId, POLICY_CONNECTION, {
          api_key: policyValue,
        });
        if (!isCurrent()) return;
        // Ignore a slower initial read of the old vault after this confirmed save.
        readVersion.current++;
        setPolicyStatus('saved');
        setPolicyKey('');
      }
      if (isCurrent()) setSaved(true);
    } catch {
      if (isCurrent())
        onError(
          sandboxSaved
            ? 'Sandbox API key saved. The NSR policy key could not be saved. Your policy key entry is retained; try again.'
            : 'The API keys could not be saved. Your entries are still here; try again.'
        );
    } finally {
      inFlight.current = false;
      if (alive.current && currentScope.current === scope) setSaving(false);
    }
  };

  return (
    <section aria-label="Sandbox connection" className="space-y-4 text-xs">
      <div>
        <h2 className="text-sm font-medium text-gray-200">Connect your computer</h2>
        <p className="mt-1 text-gray-400">
          Save your keys, then start a chat. Each chat prepares its own computer in the background.
        </p>
      </div>
      <ul aria-label="Chat setup checklist" className="grid gap-3 sm:grid-cols-2">
        <li className="rounded-lg border border-gray-700/50 p-3">
          <p className="flex items-center gap-2 text-gray-200">
            {savedKey ? (
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Circle aria-hidden="true" className="h-3.5 w-3.5" />
            )}{' '}
            Computer access
          </p>
          <p className="mt-1 text-gray-400">
            {savedKey ? 'Sandbox key saved' : 'Add a Sandbox API key'}
          </p>
        </li>
        <li className="rounded-lg border border-gray-700/50 p-3">
          <p className="flex items-center gap-2 text-gray-200">
            {policyStatus === 'saved' ? (
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Circle aria-hidden="true" className="h-3.5 w-3.5" />
            )}{' '}
            Policy checks
          </p>
          <p className="mt-1 text-gray-400">
            {policyStatus === 'saved'
              ? 'NSR key saved for this brand'
              : policyStatus === 'loading'
                ? 'Checking saved NSR key…'
                : policyStatus === 'unavailable'
                  ? 'Saved NSR key could not be read'
                  : 'Add an NSR policy API key'}
          </p>
        </li>
      </ul>
      <p className="text-gray-500">Saving keys does not create a computer or start a task.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-gray-400">
          Sandbox API key
          <input
            aria-label="Sandbox API key"
            type="password"
            autoComplete="off"
            value={key}
            disabled={saving}
            aria-invalid={invalidSandbox || undefined}
            aria-describedby={invalidSandbox ? `${keyHint} ${issueId}` : keyHint}
            onChange={(event) => {
              setKey(event.target.value);
              setSaved(false);
            }}
            placeholder={savedKey ? 'Use saved key' : 'Enter your API key'}
            className="minimal-input mt-1 w-full"
          />
          <span id={keyHint} className="mt-1 block text-gray-500">
            Used for computer access across this app. No workflow-engine connection is required.
          </span>
        </label>
        <label className="text-gray-400">
          NSR policy API key
          <input
            aria-label="NSR policy API key"
            type="password"
            autoComplete="off"
            value={policyKey}
            disabled={saving}
            aria-invalid={invalidPolicy || undefined}
            aria-describedby={invalidPolicy ? `${policyHint} ${issueId}` : policyHint}
            onChange={(event) => {
              setPolicyKey(event.target.value);
              setSaved(false);
            }}
            placeholder={policyStatus === 'saved' ? 'Use saved key' : 'Enter your policy API key'}
            className="minimal-input mt-1 w-full"
          />
          <span id={policyHint} className="mt-1 block text-gray-500">
            Saved for the selected organization and brand. Must belong to the same Sandbox
            organization.
          </span>
        </label>
      </div>
      {(invalidSandbox || invalidPolicy) && (
        <p id={issueId} role="alert" className="text-red-400">
          Enter a key without control characters and no longer than 4096 characters. Placeholder
          Sandbox keys cannot be used.
        </p>
      )}
      <p className="text-gray-500">
        The Sandbox organization supplies model access. Computers last up to one hour; use Stop
        computer to end a session. Agent work runs while the app is open.
      </p>
      {secureStorage !== true && (
        <p role="status" aria-label="Credential storage" className="chat-setup-warning">
          {secureStorage === false
            ? 'Your system keyring is unavailable. Both API keys last until you quit the app.'
            : 'Secure storage availability has not been confirmed. Saved keys may last only until you quit the app.'}
        </p>
      )}
      <button
        type="button"
        className="minimal-primary-button"
        disabled={saving || invalidSandbox || invalidPolicy || !(key.trim() || policyKey.trim())}
        onClick={() => void save()}
      >
        {saving ? 'Saving…' : 'Save API keys'}
      </button>
      {saved && (
        <p role="status" className="text-emerald-400">
          API keys saved
        </p>
      )}
      <SandboxConnectionCheck
        tenantId={tenantId}
        brandId={brandId}
        editing={saving || Boolean(key.trim() || policyKey.trim())}
      />
    </section>
  );
}
