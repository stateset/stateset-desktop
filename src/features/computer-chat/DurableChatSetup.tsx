import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { durableChatApi } from './durable';
import { type DurableChatConfiguration, type SetupReport } from './durableTypes';
import { acceptanceCriteriaSchema, parseStartConfiguration } from './configuration';
import { useComputerChatsStore } from './store';
import { useSecureStorageAvailability } from '../../hooks/useSecureStorageAvailability';
import {
  sameSetupConnection,
  sameSetupContext,
  type CheckedSetup,
  type SetupContext,
} from './setup';

interface Props {
  tenantId: string;
  brandId: string;
  configuration: DurableChatConfiguration;
  onChange: (configuration: DurableChatConfiguration) => void;
  onReport: (report: CheckedSetup | null) => void;
  report: SetupReport | null;
  onError: (message: string) => void;
}
const criterionLabels = {
  json: 'JSON value',
  contains: 'Contains text',
  equals: 'Exact text',
  sha256: 'SHA-256 digest',
  png: 'PNG structure and dimensions',
};
export function DurableChatSetup({
  tenantId,
  brandId,
  configuration,
  onChange,
  onReport,
  report,
  onError,
}: Props) {
  const engine = useDurableWorkflowsStore();
  const secureStorageAvailable = useSecureStorageAvailability();
  const [url, setUrl] = useState(engine.engineUrl);
  const urlEdited = useRef(false);
  useEffect(() => {
    if (engine.initialized && !urlEdited.current) setUrl(engine.engineUrl);
  }, [engine.initialized, engine.engineUrl]);
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingDefaults = useRef(false);
  const defaultsFingerprint = JSON.stringify([tenantId, brandId, configuration]);
  const currentDefaults = useRef(defaultsFingerprint);
  currentDefaults.current = defaultsFingerprint;
  const addCriterionButton = useRef<HTMLButtonElement>(null);
  const restoreCriterionFocus = useRef(false);
  const [discovered, setDiscovered] = useState<CheckedSetup | null>(null);
  const [path, setPath] = useState('/workspace/report.json');
  const [kind, setKind] = useState<'contains' | 'equals' | 'json' | 'sha256' | 'png'>('json');
  const [expected, setExpected] = useState('true');
  const [pointer, setPointer] = useState('/success');
  const [criterionError, setCriterionError] = useState('');
  const criterionErrorId = useId();
  const alive = useRef(true);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const latest = useRef({ tenantId, brandId, mcpServers: configuration.mcp_servers });
  latest.current = { tenantId, brandId, mcpServers: configuration.mcp_servers };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (restoreCriterionFocus.current) {
      restoreCriterionFocus.current = false;
      addCriterionButton.current?.focus();
    }
  }, [configuration.criteria]);
  const tools =
    discovered &&
    sameSetupConnection(discovered.context, {
      tenantId,
      brandId,
      engineUrl: engine.engineUrl,
      apiKey: engine.apiKey,
      connectionRevision: engine.connectionRevision,
      configuring: engine.configuring,
      mcpServers: configuration.mcp_servers,
    })
      ? discovered.report.mcp_servers
      : [];
  const invalidate = (connectionChanged = false) => {
    revision.current++;
    if (connectionChanged) setDiscovered(null);
    onReport(null);
  };
  const update = (patch: Partial<DurableChatConfiguration>) => {
    onChange({ ...configuration, ...patch });
    setSaved(null);
    setEdited(true);
    setSaveError('');
  };
  const check = async () => {
    if (!useDurableWorkflowsStore.getState().initialized) {
      onError('Load saved workflow settings before checking this connection.');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const attempt = ++revision.current;
    setChecking(true);
    onReport(null);
    onError('');
    let context: SetupContext | undefined;
    try {
      await engine.setConfiguration(url, key.trim() || undefined);
      if (alive.current && attempt === revision.current) setKey('');
      if (!alive.current || attempt !== revision.current) return;
      const connection = useDurableWorkflowsStore.getState();
      context = {
        tenantId,
        brandId,
        engineUrl: connection.engineUrl,
        apiKey: connection.apiKey,
        connectionRevision: connection.connectionRevision,
        configuring: connection.configuring,
        mcpServers: [...configuration.mcp_servers],
      };
      const result = await durableChatApi.diagnostics(tenantId, brandId, context.mcpServers);
      const current = useDurableWorkflowsStore.getState();
      if (
        alive.current &&
        attempt === revision.current &&
        sameSetupContext(context, {
          ...latest.current,
          engineUrl: current.engineUrl,
          apiKey: current.apiKey,
          connectionRevision: current.connectionRevision,
          configuring: current.configuring,
        })
      ) {
        const checked = { context, report: result };
        setDiscovered(checked);
        onReport(checked);
      }
    } catch (error) {
      const current = useDurableWorkflowsStore.getState();
      if (
        alive.current &&
        attempt === revision.current &&
        (!context ||
          sameSetupContext(context, {
            ...latest.current,
            engineUrl: current.engineUrl,
            apiKey: current.apiKey,
            connectionRevision: current.connectionRevision,
            configuring: current.configuring,
          }))
      )
        onError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      if (alive.current) setChecking(false);
    }
  };
  const save = async () => {
    if (savingDefaults.current) return;
    setSaveError('');
    let parsed: DurableChatConfiguration;
    try {
      parsed = parseStartConfiguration(configuration);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return;
    }
    const snapshot = defaultsFingerprint;
    savingDefaults.current = true;
    setSaving(true);
    setSaved(null);
    try {
      await useComputerChatsStore.getState().setConfiguration(`${tenantId}:${brandId}`, parsed);
      if (alive.current && currentDefaults.current === snapshot) {
        setSaved(snapshot);
        setEdited(false);
      }
    } catch {
      if (alive.current && currentDefaults.current === snapshot)
        setSaveError('Defaults could not be saved. Your changes are still here. Try again.');
    } finally {
      savingDefaults.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const addCriterion = () => {
    try {
      let value: unknown = expected;
      if (kind === 'json' || kind === 'png') {
        try {
          value = JSON.parse(expected);
        } catch {
          throw new Error('Enter valid JSON for the expected value.');
        }
      }
      if (kind === 'sha256' && !/^[a-f0-9]{64}$/i.test(expected))
        throw new Error('Enter a SHA-256 digest');
      const result = acceptanceCriteriaSchema.safeParse([
        ...configuration.criteria,
        { path, kind, expected: value, ...(kind === 'json' && pointer ? { pointer } : {}) },
      ]);
      if (!result.success) throw new Error(result.error.issues[0].message);
      update({ criteria: result.data });
      setCriterionError('');
    } catch (error) {
      setCriterionError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section aria-label="Computer setup and defaults" className="chat-setup-content text-sm">
      <h2 className="text-sm font-medium">
        Computer setup and defaults {report?.ready ? '· Ready' : ''}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-[2fr_2fr_auto]">
        <label className="text-xs text-gray-400">
          Workflow engine URL
          <input
            value={url}
            onChange={(e) => {
              urlEdited.current = true;
              setUrl(e.target.value);
              invalidate(true);
            }}
            className="minimal-input mt-1 w-full"
            placeholder="https://api.workstream.stateset.com"
          />
        </label>
        <label className="text-xs text-gray-400">
          Workflow API key
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              invalidate(true);
            }}
            placeholder={engine.apiKey ? 'Use current key' : 'Enter your API key'}
            className="minimal-input mt-1 w-full"
          />
        </label>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking || !engine.initialized}
          className="minimal-primary-button self-end"
        >
          {checking ? 'Checking…' : 'Save connection and check'}
        </button>
      </div>
      {secureStorageAvailable === false && (
        <p role="status" className="chat-setup-warning mt-2 text-xs">
          Your system keyring is unavailable. The API key lasts until you quit the app. Enter it
          again after restarting to reconnect your computers. Running workflows continue on the
          server.
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        The engine manages computer access, inference credentials, policy checks, and recovery. Work
        continues after this app closes.
      </p>
      {report && (
        <ul className="mt-3 space-y-1" aria-label="Connection diagnostics">
          {report.checks.map((c) => (
            <li
              key={c.key}
              className={`text-xs ${c.status === 'pass' ? 'text-emerald-400' : 'chat-setup-warning'}`}
            >
              {c.status === 'pass' ? '✓' : '!'} {c.message}
            </li>
          ))}
        </ul>
      )}
      <details className="chat-advanced-settings mt-5">
        <summary>Defaults and permissions</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="text-xs text-gray-400">
            Model
            <input
              aria-label="Computer chat model"
              value={configuration.model}
              onChange={(e) => update({ model: e.target.value })}
              className="minimal-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-400">
            Spending limit (USD)
            <input
              type="number"
              min="0.01"
              max="20"
              step="0.25"
              value={configuration.budget.max_cost_cents / 100}
              onChange={(e) =>
                update({
                  budget: {
                    ...configuration.budget,
                    max_cost_cents: Math.round(Number(e.target.value) * 100),
                  },
                })
              }
              className="minimal-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-400">
            Token limit
            <input
              type="number"
              min="8192"
              max="1000000"
              value={configuration.budget.max_tokens}
              onChange={(e) =>
                update({ budget: { ...configuration.budget, max_tokens: Number(e.target.value) } })
              }
              className="minimal-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-400">
            Action limit
            <input
              type="number"
              min="1"
              max="500"
              value={configuration.budget.max_actions}
              onChange={(e) =>
                update({ budget: { ...configuration.budget, max_actions: Number(e.target.value) } })
              }
              className="minimal-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-400">
            Lifetime (minutes)
            <input
              type="number"
              min="1"
              max="1440"
              value={configuration.budget.max_runtime_seconds / 60}
              onChange={(e) =>
                update({
                  budget: {
                    ...configuration.budget,
                    max_runtime_seconds: Math.round(Number(e.target.value) * 60),
                  },
                })
              }
              className="minimal-input mt-1 w-full"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          <label>
            <input
              type="checkbox"
              checked={configuration.permissions.allow_gui}
              onChange={(e) =>
                update({
                  permissions: { ...configuration.permissions, allow_gui: e.target.checked },
                })
              }
            />{' '}
            Allow desktop controls
          </label>
          <label>
            <input
              type="checkbox"
              checked={configuration.permissions.require_action_approval}
              onChange={(e) =>
                update({
                  permissions: {
                    ...configuration.permissions,
                    require_action_approval: e.target.checked,
                  },
                })
              }
            />{' '}
            Review every action before execution
          </label>
        </div>
        <label className="mt-3 block text-xs text-gray-400">
          Allowed command executables
          <input
            value={configuration.permissions.allowed_executables.join(', ')}
            onChange={(e) =>
              update({
                permissions: {
                  ...configuration.permissions,
                  allowed_executables: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            className="minimal-input mt-1 w-full"
          />
        </label>
        {tools.length > 0 && (
          <fieldset className="mt-3 text-xs text-gray-400">
            <legend>Connected tools</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {tools.map((server) => (
                <label key={server.key}>
                  <input
                    type="checkbox"
                    checked={configuration.mcp_servers.includes(server.key)}
                    disabled={!server.ready}
                    onChange={(e) => {
                      update({
                        mcp_servers: e.target.checked
                          ? [...configuration.mcp_servers, server.key]
                          : configuration.mcp_servers.filter((s) => s !== server.key),
                      });
                      invalidate();
                    }}
                  />{' '}
                  {server.key}
                  {server.ready ? '' : ' (needs tool permissions)'}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </details>
      <details className="mt-4 pt-3">
        <summary className="cursor-pointer text-xs text-gray-300">
          Acceptance criteria ({configuration.criteria.length})
        </summary>
        <p className="mt-2 text-xs text-gray-500">
          Set the conditions a file must meet to be verified. Files without checks remain observed.
        </p>
        <p className="mt-1 text-xs text-gray-500">Up to eight checks across four files.</p>
        <ul className="mt-2 space-y-2">
          {configuration.criteria.map((criterion, index) => (
            <li key={index} className="flex items-start justify-between gap-3 py-1 text-xs">
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="font-medium text-gray-300">{criterion.path}</p>
                <p className="mt-1 text-gray-400">
                  {criterionLabels[criterion.kind]}
                  {criterion.pointer ? ` ${criterion.pointer}` : ''} ·{' '}
                  {JSON.stringify(criterion.expected).slice(0, 120)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  restoreCriterionFocus.current = true;
                  update({ criteria: configuration.criteria.filter((_, i) => i !== index) });
                  setCriterionError('');
                }}
                className="shrink-0 rounded px-2 py-1 text-[var(--chat-muted)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)]"
                aria-label={`Remove criterion ${index + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-xs text-gray-400">
            File path
            <input
              value={path}
              aria-describedby={criterionError ? criterionErrorId : undefined}
              onChange={(e) => {
                setPath(e.target.value);
                setCriterionError('');
              }}
              className="minimal-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-400">
            Check
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setCriterionError('');
              }}
              className="minimal-input mt-1 w-full"
            >
              {Object.entries(criterionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Expected {kind === 'json' || kind === 'png' ? 'JSON' : 'value'}
            <input
              value={expected}
              aria-describedby={criterionError ? criterionErrorId : undefined}
              onChange={(e) => {
                setExpected(e.target.value);
                setCriterionError('');
              }}
              className="minimal-input mt-1 w-full"
            />
          </label>
          {kind === 'json' && (
            <label className="text-xs text-gray-400">
              JSON pointer
              <input
                value={pointer}
                onChange={(e) => {
                  setPointer(e.target.value);
                  setCriterionError('');
                }}
                placeholder="/success"
                className="minimal-input mt-1 w-full"
              />
            </label>
          )}
        </div>
        {criterionError && (
          <p id={criterionErrorId} role="alert" className="mt-2 text-xs text-[var(--ui-negative)]">
            {criterionError}
          </p>
        )}
        <button
          ref={addCriterionButton}
          type="button"
          onClick={addCriterion}
          disabled={configuration.criteria.length >= 8}
          className="minimal-secondary-button mt-2"
        >
          Add criterion
        </button>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          aria-busy={saving}
          className="minimal-secondary-button"
        >
          {saving ? 'Saving…' : 'Save defaults for this brand'}
        </button>
        <span
          role="status"
          className={`text-xs ${saved === defaultsFingerprint ? 'text-emerald-400' : 'text-gray-500'}`}
        >
          {!saving &&
            (saved === defaultsFingerprint ? 'Defaults saved' : edited ? 'Unsaved changes' : '')}
        </span>
      </div>
      {saveError && (
        <p role="alert" className="mt-2 text-xs text-[var(--ui-negative)]">
          {saveError}
        </p>
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        Defaults apply to new chats. Existing chats retain their original limits, permissions, and
        acceptance criteria.
      </p>
    </section>
  );
}
