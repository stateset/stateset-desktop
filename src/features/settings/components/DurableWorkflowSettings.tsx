import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { WorkflowInitializationNotice } from '../../../components/WorkflowInitializationNotice';
import { CheckCircle2, KeyRound, Loader2, Network, Trash2, XCircle } from 'lucide-react';
import { durableWorkflowApi } from '../../../lib/durableWorkflows';
import { useAuthStore } from '../../../stores/auth';
import {
  getWorkflowConnectionGeneration,
  useDurableWorkflowsStore,
} from '../../../stores/durableWorkflows';
import { useSecureStorageAvailability } from '../../../hooks/useSecureStorageAvailability';

type Action = 'save' | 'test' | 'remove';
interface FeedbackScope {
  tenantId: string | null;
  draftRevision: number;
  initialized: boolean;
  configuring: boolean;
  engineUrl: string;
  apiKey: string | null;
  connectionRevision: string | null;
  generation: number;
}
interface ActiveAction {
  kind: Action;
  scope: FeedbackScope;
  generation: number;
  invoking: boolean;
  valid: boolean;
}
interface Feedback {
  ok: boolean;
  message: string;
  scope: FeedbackScope;
}

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');
const sameScope = (left: FeedbackScope, right: FeedbackScope) =>
  (Object.keys(left) as Array<keyof FeedbackScope>).every((key) => left[key] === right[key]);

export function DurableWorkflowSettings() {
  const secureStorageAvailable = useSecureStorageAvailability();
  const tenant = useAuthStore((state) => state.tenant);
  const { initialized, configuring, engineUrl, apiKey, initialize, setConfiguration, clearApiKey } =
    useDurableWorkflowsStore();
  const [urlInput, setUrlInput] = useState(engineUrl);
  const urlEdited = useRef(false);
  const draftRevision = useRef(0);
  const [keyInput, setKeyInput] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const activeAction = useRef<ActiveAction | null>(null);
  const mounted = useRef(true);
  const [result, setResult] = useState<Feedback | null>(null);
  const dirtyHintId = useId();
  const dirty = normalizeUrl(urlInput) !== normalizeUrl(engineUrl) || keyInput.length > 0;
  const isSaving = action === 'save';
  const isTesting = action === 'test';
  const isRemoving = action === 'remove';
  const busy = action !== null || configuring;

  const readScope = useCallback((): FeedbackScope => {
    const current = useDurableWorkflowsStore.getState();
    return {
      tenantId: useAuthStore.getState().tenant?.id ?? null,
      draftRevision: draftRevision.current,
      initialized: current.initialized,
      configuring: current.configuring,
      engineUrl: current.engineUrl,
      apiKey: current.apiKey,
      connectionRevision: current.connectionRevision,
      generation: getWorkflowConnectionGeneration(),
    };
  }, []);

  const scopeMatches = useCallback(
    (scope: FeedbackScope) => sameScope(scope, readScope()),
    [readScope]
  );

  useEffect(() => {
    mounted.current = true;
    const contextChanged = (externalMetadataChange = false) => {
      const current = readScope();
      const pending = activeAction.current;
      if (pending?.kind === 'test' && !scopeMatches(pending.scope)) {
        activeAction.current = null;
        setAction(null);
      } else if (
        pending &&
        (!current.initialized ||
          current.tenantId !== pending.scope.tenantId ||
          externalMetadataChange ||
          (!pending.invoking && current.generation !== pending.generation))
      ) {
        pending.valid = false;
      }
      setResult((currentResult) =>
        currentResult && !sameScope(currentResult.scope, current) ? null : currentResult
      );
    };
    // Observe transitions synchronously, including A -> B -> A in one render.
    const unsubscribeConnection = useDurableWorkflowsStore.subscribe((current, previous) => {
      const externalMetadataChange =
        !current.configuring &&
        !previous.configuring &&
        (current.engineUrl !== previous.engineUrl ||
          current.apiKey !== previous.apiKey ||
          current.connectionRevision !== previous.connectionRevision);
      contextChanged(externalMetadataChange);
    });
    const unsubscribeTenant = useAuthStore.subscribe((current, previous) => {
      if (current.tenant?.id !== previous.tenant?.id) contextChanged();
    });
    return () => {
      mounted.current = false;
      activeAction.current = null;
      unsubscribeConnection();
      unsubscribeTenant();
    };
  }, [readScope, scopeMatches]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (initialized && !urlEdited.current) setUrlInput(engineUrl);
  }, [engineUrl, initialized]);

  const editDraft = () => {
    draftRevision.current++;
    if (activeAction.current?.kind === 'test') {
      activeAction.current = null;
      setAction(null);
    }
    setResult(null);
  };

  const beginAction = (kind: Action) => {
    const current = useDurableWorkflowsStore.getState();
    if (!mounted.current || activeAction.current || !current.initialized || current.configuring)
      return null;
    const scope = readScope();
    const pending: ActiveAction = {
      kind,
      scope,
      generation: scope.generation,
      invoking: false,
      valid: true,
    };
    activeAction.current = pending;
    setAction(kind);
    setResult(null);
    return pending;
  };

  const finishAction = (pending: ActiveAction) => {
    if (mounted.current && activeAction.current === pending) {
      activeAction.current = null;
      setAction(null);
    }
  };

  const mutationMatches = (pending: ActiveAction) => {
    const current = readScope();
    return (
      mounted.current &&
      activeAction.current === pending &&
      pending.valid &&
      current.initialized &&
      !current.configuring &&
      current.tenantId === pending.scope.tenantId &&
      current.draftRevision === pending.scope.draftRevision &&
      current.generation === pending.generation
    );
  };

  const save = async () => {
    const current = useDurableWorkflowsStore.getState();
    if (!urlInput.trim() || (!current.apiKey && !keyInput.trim())) return;
    const pending = beginAction('save');
    if (!pending) return;
    try {
      pending.invoking = true;
      const saving = setConfiguration(urlInput, keyInput || undefined);
      pending.generation = getWorkflowConnectionGeneration();
      if (pending.generation > pending.scope.generation + 1) pending.valid = false;
      pending.invoking = false;
      await saving;
      if (mutationMatches(pending)) {
        setKeyInput('');
        urlEdited.current = false;
        setUrlInput(useDurableWorkflowsStore.getState().engineUrl);
        setResult({
          ok: true,
          message: 'Durable workflow configuration saved.',
          scope: readScope(),
        });
      }
    } catch (error) {
      if (mutationMatches(pending))
        setResult({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          scope: readScope(),
        });
    } finally {
      pending.invoking = false;
      finishAction(pending);
    }
  };

  const test = async () => {
    const current = useDurableWorkflowsStore.getState();
    const tenantId = useAuthStore.getState().tenant?.id;
    if (
      !tenantId ||
      !current.apiKey ||
      normalizeUrl(urlInput) !== normalizeUrl(current.engineUrl) ||
      keyInput.length
    )
      return;
    const pending = beginAction('test');
    if (!pending) return;
    try {
      await durableWorkflowApi.health(tenantId);
      if (mounted.current && activeAction.current === pending && scopeMatches(pending.scope))
        setResult({
          ok: true,
          message: 'Durable workflow engine is reachable.',
          scope: pending.scope,
        });
    } catch (error) {
      if (mounted.current && activeAction.current === pending && scopeMatches(pending.scope))
        setResult({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          scope: pending.scope,
        });
    } finally {
      finishAction(pending);
    }
  };

  const removeKey = async () => {
    if (!useDurableWorkflowsStore.getState().apiKey) return;
    const pending = beginAction('remove');
    if (!pending) return;
    try {
      pending.invoking = true;
      const removing = clearApiKey();
      pending.generation = getWorkflowConnectionGeneration();
      if (pending.generation > pending.scope.generation + 1) pending.valid = false;
      pending.invoking = false;
      await removing;
      if (mutationMatches(pending))
        setResult({ ok: true, message: 'Durable workflow API key removed.', scope: readScope() });
    } catch (error) {
      if (mutationMatches(pending))
        setResult({
          ok: false,
          message: `Unable to remove API key. ${error instanceof Error ? error.message : String(error)}`,
          scope: readScope(),
        });
    } finally {
      pending.invoking = false;
      finishAction(pending);
    }
  };

  const visibleResult = result && scopeMatches(result.scope) ? result : null;

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
        <WorkflowInitializationNotice />
        <label className="block">
          <span className="text-sm font-medium text-gray-300">Engine URL</span>
          <input
            type="url"
            value={initialized || urlEdited.current ? urlInput : ''}
            onChange={(event) => {
              urlEdited.current = true;
              editDraft();
              setUrlInput(event.target.value);
            }}
            className="mt-1.5 w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-brand-500"
            placeholder={
              initialized ? 'https://api.workstream.stateset.com' : 'Saved connection not loaded'
            }
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> API key
          </span>
          <input
            type="password"
            value={keyInput}
            onChange={(event) => {
              editDraft();
              setKeyInput(event.target.value);
            }}
            className="mt-1.5 w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-brand-500"
            placeholder={
              !initialized
                ? 'Key status unavailable'
                : apiKey
                  ? 'Enter a new key to replace the current key'
                  : 'Required'
            }
            autoComplete="off"
          />
          <span className="text-xs text-[var(--ui-muted)] mt-1 block">
            {!initialized
              ? 'Key status unavailable until settings load.'
              : apiKey
                ? secureStorageAvailable === true
                  ? 'The key is encrypted using operating system secure storage.'
                  : secureStorageAvailable === false
                    ? 'The key is available for this app session. Enter it again after restarting.'
                    : 'A key is configured. Credential storage availability could not be confirmed.'
                : 'No key configured.'}
          </span>
        </label>

        {dirty && initialized && (
          <p id={dirtyHintId} className="text-xs text-[var(--ui-muted)]">
            Save changes before testing.
          </p>
        )}

        {visibleResult && (
          <div
            role={visibleResult.ok ? 'status' : 'alert'}
            aria-atomic="true"
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              visibleResult.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {visibleResult.ok ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            )}
            {visibleResult.message}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!initialized || busy || !urlInput.trim() || (!apiKey && !keyInput.trim())}
            aria-busy={isSaving}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-sm font-medium"
          >
            {isSaving ? 'Saving…' : 'Save configuration'}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={!initialized || busy || dirty || !apiKey || !tenant?.id}
            aria-busy={isTesting}
            aria-describedby={dirty && initialized ? dirtyHintId : undefined}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            {isTesting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Test connection
          </button>
          {apiKey && (
            <button
              type="button"
              disabled={!initialized || busy}
              onClick={removeKey}
              aria-label="Remove key"
              aria-busy={isRemoving}
              className="px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/10 text-sm flex items-center gap-2"
            >
              {isRemoving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              )}
              {isRemoving ? 'Removing…' : 'Remove key'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
