import { useEffect, useId, useRef, useState } from 'react';
import { computerChatRuntime } from './runtime';
import type { ComputerChat } from './types';
import type { FileCheckKind } from './sandboxArtifact';

export function SandboxArtifactPanel({ chat, busy }: { chat: ComputerChat; busy: boolean }) {
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<FileCheckKind>('contains');
  const [expected, setExpected] = useState('');
  const [changed, setChanged] = useState(false);
  const submitted = useRef(false);
  const description = useId();
  const pathId = useId();
  const kindId = useId();
  const expectedId = useId();
  const receipt = chat.artifactVerification;
  useEffect(() => {
    setChanged(false);
  }, [receipt?.requestId]);
  const disabled =
    busy ||
    Boolean(chat.stopped || chat.sandboxStopRequested || chat.pending) ||
    chat.session?.status !== 'running';
  const edit = () => setChanged(true);
  return (
    <details className="m-3 text-xs text-gray-400">
      <summary>Verify a file</summary>
      <p id={description} className="mt-2 text-gray-500">
        The desktop checks file bytes against your expectation, then NSR verifies the decision
        proof. A match confirms this file version at the time of checking, rather than the accuracy
        of the agent’s answer. Files can be up to 128 KiB.
      </p>
      <form
        aria-label="File verification"
        aria-describedby={description}
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || submitted.current) return;
          submitted.current = true;
          void computerChatRuntime
            .verifyArtifact(chat.id, { path, kind, expected })
            .finally(() => {
              submitted.current = false;
            })
            .catch(() => undefined);
        }}
      >
        <div>
          <label htmlFor={pathId} className="block">
            Workspace file
          </label>
          <input
            id={pathId}
            className="minimal-input mt-1 w-full"
            value={path}
            placeholder="/workspace/report.txt"
            disabled={disabled}
            onChange={(event) => {
              setPath(event.target.value);
              edit();
            }}
            spellCheck={false}
          />
        </div>
        <div>
          <label htmlFor={kindId} className="block">
            File check
          </label>
          <select
            id={kindId}
            className="minimal-input mt-1 w-full"
            value={kind}
            disabled={disabled}
            onChange={(event) => {
              setKind(event.target.value as FileCheckKind);
              edit();
            }}
          >
            <option value="contains">Contains text</option>
            <option value="equals">Exact text</option>
            <option value="sha256">SHA-256 digest</option>
          </select>
        </div>
        <div>
          <label htmlFor={expectedId} className="block">
            Expected value
          </label>
          <textarea
            id={expectedId}
            className="minimal-input mt-1 w-full"
            rows={3}
            value={expected}
            disabled={disabled}
            onChange={(event) => {
              setExpected(event.target.value);
              edit();
            }}
          />
        </div>
        <p className="text-gray-500">
          Only hashes and the comparison result are sent to the NSR Decisions API. File contents and
          expected values stay in the desktop and are not saved in this chat.
        </p>
        <button
          type="submit"
          className="minimal-secondary-button"
          disabled={disabled || !path || (kind !== 'equals' && !expected)}
        >
          Check file with NSR
        </button>
      </form>
      {receipt && (
        <div role="status" className="mt-3 space-y-1">
          <p>
            {receipt.outdated
              ? 'Earlier file version — current contents have not been checked.'
              : receipt.verification.verified
                ? 'Collected file matched your check.'
                : receipt.observationMatched
                  ? 'Collected file matched; NSR did not accept this check.'
                  : 'Collected file did not match your check.'}
          </p>
          <p className="break-all">{receipt.path}</p>
          {receipt.decisionId && <p className="break-all">NSR decision: {receipt.decisionId}</p>}
          <p>
            Check:{' '}
            {receipt.kind === 'contains'
              ? 'Contains text'
              : receipt.kind === 'equals'
                ? 'Exact text'
                : 'SHA-256 digest'}
          </p>
          <p className="break-all">SHA-256: {receipt.sha256}</p>
          <p>{new Date(receipt.checkedAt).toLocaleString()}</p>
          {changed && <p>These form edits have not been checked.</p>}
        </div>
      )}
    </details>
  );
}
