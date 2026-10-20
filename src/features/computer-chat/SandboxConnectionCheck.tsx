import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { computerSessionApi } from './api';
import { sandboxReadiness, type SandboxCapabilities } from './sandboxReadiness';
import { SandboxRequestError } from '../../lib/sandbox';

interface CheckContext {
  tenantId: string;
  brandId: string;
  key: string | null;
}
interface CheckResult {
  context: CheckContext;
  capabilities?: SandboxCapabilities;
  error?: string;
}
const matches = (a: CheckContext, b: CheckContext) =>
  a.tenantId === b.tenantId && a.brandId === b.brandId && a.key === b.key;

export function SandboxConnectionCheck({
  tenantId,
  brandId,
  editing,
}: {
  tenantId: string;
  brandId: string;
  editing: boolean;
}) {
  const key = useAuthStore((state) => state.sandboxApiKey);
  const selectedTenant = useAuthStore((state) => state.tenant?.id);
  const selectedBrand = useAuthStore((state) => state.currentBrand?.id);
  const context: CheckContext = { tenantId, brandId, key };
  const currentContext = useRef(context);
  currentContext.current = context;
  const controller = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const selected = selectedTenant === tenantId && selectedBrand === brandId;
  const displayed =
    selected && !editing && result && matches(result.context, context) ? result : null;
  const report = displayed?.capabilities ? sandboxReadiness(displayed.capabilities) : null;
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setChecking(false);
    setResult(null);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [tenantId, brandId, key, editing, selectedTenant, selectedBrand]);

  const check = async () => {
    if (controller.current || !key || editing || !selected) return;
    const active = new AbortController();
    controller.current = active;
    setChecking(true);
    setResult(null);
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return (
        !active.signal.aborted &&
        controller.current === active &&
        matches(context, currentContext.current) &&
        auth.sandboxApiKey === key &&
        auth.tenant?.id === tenantId &&
        auth.currentBrand?.id === brandId
      );
    };
    try {
      const capabilities = await computerSessionApi.capabilities(active.signal);
      if (isCurrent()) setResult({ context, capabilities });
    } catch (error) {
      if (isCurrent())
        setResult({
          context,
          error:
            error instanceof SandboxRequestError && [401, 403].includes(error.status)
              ? 'Sandbox access was rejected. Check the saved API key and its sandbox:read permission. Your saved key has been retained.'
              : 'The Sandbox connection could not be confirmed. Check the endpoint and try again. Your saved keys have been retained.',
        });
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setChecking(false);
      }
    }
  };
  return (
    <div className="chat-connection-check space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="minimal-secondary-button"
          disabled={!key || editing || checking || !selected}
          onClick={() => void check()}
        >
          {checking ? 'Checking Sandbox…' : 'Check Sandbox connection'}
        </button>
        <span className="text-gray-500">Read-only · no computer or task is started</span>
      </div>
      {editing && (
        <p className="text-gray-500">
          Save or clear your key edits before checking the saved connection.
        </p>
      )}
      <div role="status" aria-label="Sandbox connection check" aria-busy={checking}>
        {checking ? (
          <p>Checking the saved Sandbox connection…</p>
        ) : displayed?.error ? (
          <p className="ui-negative">{displayed.error}</p>
        ) : report ? (
          <div className="space-y-2">
            <p className={report.ready ? 'text-emerald-400' : 'chat-setup-warning'}>
              {report.ready
                ? 'Sandbox capabilities confirmed'
                : 'Sandbox connected; setup needs attention'}
            </p>
            <ul className="space-y-2" aria-label="Sandbox capability checks">
              {report.checks.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  {item.ready ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Circle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {item.label}: {item.ready ? 'available' : item.issue}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-gray-500">
              This checks declared capabilities. It does not test model credits, actual execution,
              NSR policy decisions or durable workflows.
            </p>
          </div>
        ) : (
          <p className="text-gray-500">Saved keys have not been tested against live services.</p>
        )}
      </div>
    </div>
  );
}
