import { useRef } from 'react';
import { actionRecovery } from './actionRecovery';
import { computerChatRuntime } from './runtime';
import type { ComputerAction, ComputerChat } from './types';

const labels: Record<ComputerAction['name'], string> = {
  execute: 'Run command',
  screenshot: 'Capture desktop',
  click: 'Click',
  type_text: 'Enter text',
  press_key: 'Press key',
};
const PREVIEW_LIMIT = 4000;

export function ActionRecoveryPanel({ chat, busy }: { chat: ComputerChat; busy: boolean }) {
  const inFlight = useRef(false);
  const recovery = actionRecovery(chat);
  const pending = chat.pending;
  if (!recovery || !pending) return null;
  const command = JSON.stringify(pending.command, null, 2);
  const result = pending.result;
  const shortened =
    result &&
    (result.outputTruncated ||
      result.stdout.length > PREVIEW_LIMIT ||
      result.stderr.length > PREVIEW_LIMIT);
  return (
    <section
      aria-label="Action recovery"
      className="m-3 space-y-2 rounded-xl border border-slate-500/25 p-3 text-xs text-gray-400"
    >
      <h3 className="font-medium text-[var(--ui-text)]">{recovery.title}</h3>
      <p>{recovery.description}</p>
      {recovery.action && (
        <button
          type="button"
          className="minimal-secondary-button"
          disabled={busy}
          onClick={() => {
            if (busy || inFlight.current) return;
            inFlight.current = true;
            const task =
              recovery.action === 'refresh'
                ? computerChatRuntime.refresh(chat.id)
                : computerChatRuntime.resume(chat.id);
            void task
              .finally(() => {
                inFlight.current = false;
              })
              .catch(() => undefined);
          }}
        >
          {recovery.actionLabel}
        </button>
      )}
      <details>
        <summary className="cursor-pointer">Action details</summary>
        <dl className="mt-2 space-y-1 break-all">
          <div>
            <dt>Action</dt>
            <dd>{labels[pending.action.name]}</dd>
          </div>
          <div>
            <dt>Request</dt>
            <dd>{pending.requestId}</dd>
          </div>
          <div>
            <dt>Original computer</dt>
            <dd>{pending.computer?.sandboxId ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Original session</dt>
            <dd>{pending.computer?.sessionId ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Original organization</dt>
            <dd>{pending.computer?.organizationId ?? 'Not recorded'}</dd>
          </div>
          {pending.workflowId && (
            <div>
              <dt>Workflow</dt>
              <dd>{pending.workflowId}</dd>
            </div>
          )}
        </dl>
        <p className="mt-2">Original command</p>
        <pre
          aria-label="Original command preview"
          tabIndex={0}
          className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all"
        >
          {command.slice(0, PREVIEW_LIMIT)}
        </pre>
        {command.length > PREVIEW_LIMIT && <p>Command preview shortened.</p>}
      </details>
      {result && (
        <details>
          <summary className="cursor-pointer">Saved output</summary>
          <p className="mt-2">Unverified output · reported exit code {result.exitCode}</p>
          {pending.action.name === 'screenshot' ? (
            <p>
              Screenshot pixels are not restored from saved actions. Capture a fresh desktop image
              after recovery.
            </p>
          ) : (
            <>
              <p className="mt-2">Standard output</p>
              <pre
                aria-label="Saved standard output"
                tabIndex={0}
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all"
              >
                {result.stdout.slice(0, PREVIEW_LIMIT) || '(empty)'}
              </pre>
              <p className="mt-2">Standard error</p>
              <pre
                aria-label="Saved standard error"
                tabIndex={0}
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all"
              >
                {result.stderr.slice(0, PREVIEW_LIMIT) || '(empty)'}
              </pre>
              {shortened && (
                <p>Output preview shortened. This preview does not establish complete output.</p>
              )}
            </>
          )}
        </details>
      )}
    </section>
  );
}
