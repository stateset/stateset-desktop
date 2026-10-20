import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import { computerChatRuntime } from './runtime';
import type { ComputerChat } from './types';
import { fileCheckCriterion, FileCheckInputError, type FileCheckKind } from './fileCheck';

export function SandboxArtifactPanel({
  chat,
  busy,
  detailsRef,
}: {
  chat: ComputerChat;
  busy: boolean;
  detailsRef?: Ref<HTMLDetailsElement>;
}) {
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<FileCheckKind>('contains');
  const [expected, setExpected] = useState('');
  const [changed, setChanged] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const submitted = useRef(false);
  const alive = useRef(true);
  const pathInput = useRef<HTMLInputElement>(null);
  const expectedInput = useRef<HTMLTextAreaElement>(null);
  const description = useId();
  const pathId = useId();
  const kindId = useId();
  const expectedId = useId();
  const issueId = useId();
  const pathHint = useId();
  const expectedHint = useId();
  const receipt = chat.artifactVerification;
  useEffect(() => {
    setChanged(false);
  }, [receipt?.requestId]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const validation = useMemo(() => {
    try {
      return { criterion: fileCheckCriterion({ path, kind, expected }) };
    } catch (error) {
      return {
        issue:
          error instanceof FileCheckInputError
            ? error
            : new FileCheckInputError('path', 'Check the file path and expected value.'),
      };
    }
  }, [path, kind, expected]);
  const issue = validation.issue;
  const showIssue = Boolean(issue && (attempted || (issue.field === 'path' ? path : expected)));
  const pending = submitting;
  const disabled =
    busy ||
    pending ||
    Boolean(chat.stopped || chat.sandboxStopRequested || chat.pending) ||
    chat.session?.status !== 'running';
  const edit = () => {
    setChanged(true);
    setSubmissionError('');
  };
  return (
    <details ref={detailsRef} className="chat-tool-disclosure">
      <summary>Verify a file</summary>
      <p id={description} className="mt-2 text-gray-500">
        The desktop checks file bytes against your expectation, then NSR verifies the decision
        proof. A match confirms this file version at the time of checking, rather than the accuracy
        of the agent’s answer. Files can be up to 128 KiB.
      </p>
      <form
        aria-label="File verification"
        aria-describedby={description}
        aria-busy={pending}
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || submitted.current) return;
          setAttempted(true);
          const criterion = validation.criterion;
          if (!criterion) {
            (issue?.field === 'expected' ? expectedInput.current : pathInput.current)?.focus();
            return;
          }
          submitted.current = true;
          setSubmitting(true);
          setSubmissionError('');
          void (async () => {
            try {
              await computerChatRuntime.verifyArtifact(chat.id, criterion);
            } catch {
              if (alive.current)
                setSubmissionError(
                  'The file check did not finish. Your entries are retained; try again.'
                );
            } finally {
              submitted.current = false;
              if (alive.current) setSubmitting(false);
            }
          })();
        }}
      >
        <div>
          <label htmlFor={pathId} className="block">
            Workspace file
          </label>
          <input
            id={pathId}
            ref={pathInput}
            className="minimal-input mt-1 w-full"
            value={path}
            placeholder="/workspace/report.txt"
            disabled={disabled}
            aria-invalid={(showIssue && issue?.field === 'path') || undefined}
            aria-describedby={
              showIssue && issue?.field === 'path' ? `${pathHint} ${issueId}` : pathHint
            }
            onChange={(event) => {
              setPath(event.target.value);
              edit();
            }}
            spellCheck={false}
          />
          <p id={pathHint} className="mt-1 text-gray-500">
            Choose a file under /workspace. Directory paths cannot be checked.
          </p>
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
            ref={expectedInput}
            className="minimal-input mt-1 w-full"
            rows={3}
            value={expected}
            disabled={disabled}
            aria-invalid={(showIssue && issue?.field === 'expected') || undefined}
            aria-describedby={
              showIssue && issue?.field === 'expected' ? `${expectedHint} ${issueId}` : expectedHint
            }
            onChange={(event) => {
              setExpected(event.target.value);
              edit();
            }}
          />
          <p id={expectedHint} className="mt-1 text-gray-500">
            {kind === 'sha256'
              ? 'Enter 64 hexadecimal characters.'
              : kind === 'equals'
                ? 'Exact text may be empty; spaces and line breaks are significant.'
                : 'Enter the text the file must contain.'}{' '}
            Expected values can use up to 16,384 JSON-encoded bytes.
          </p>
        </div>
        {showIssue && (
          <p id={issueId} role="alert" className="ui-negative">
            {issue?.message}
          </p>
        )}
        {submissionError && (
          <p role="alert" className="ui-negative">
            {submissionError}
          </p>
        )}
        <p className="text-gray-500">
          Only hashes and the comparison result are sent to the NSR Decisions API. File contents and
          expected values stay in the desktop and are not saved in this chat.
        </p>
        <button
          type="submit"
          aria-label="Check file with NSR"
          aria-busy={pending}
          className="minimal-secondary-button"
          disabled={disabled || !validation.criterion}
        >
          {pending ? 'Checking file…' : 'Check file with NSR'}
        </button>
      </form>
      {receipt && (
        <div role="status" className="mt-3 space-y-1">
          <p className="chat-section-label">Last recorded check</p>
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
          <p>{new Date(receipt.checkedAt).toLocaleString()}</p>
          <details>
            <summary>Check details</summary>
            {receipt.decisionId && (
              <p className="mt-2 break-all">NSR decision: {receipt.decisionId}</p>
            )}
            <p>
              Check:{' '}
              {receipt.kind === 'contains'
                ? 'Contains text'
                : receipt.kind === 'equals'
                  ? 'Exact text'
                  : 'SHA-256 digest'}
            </p>
            <p className="break-all">SHA-256: {receipt.sha256}</p>
          </details>
          {changed && <p>These form edits have not been checked.</p>}
        </div>
      )}
    </details>
  );
}
