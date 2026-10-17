import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Download, Eye, X } from 'lucide-react';
import { durableChatController } from './durable';
import {
  artifactVerification,
  previewArtifact,
  type ArtifactContent,
  type CollectedArtifact,
} from './artifacts';
import type { ComputerChat } from './types';

export function Deliverables({ chat }: { chat: ComputerChat }) {
  const state = chat.serverState;
  if (!state) return null;
  const criteria = chat.durableSession?.configuration.criteria ?? [];
  const verified =
    criteria.length > 0 &&
    criteria.every((criterion) =>
      state.artifacts.some(
        (artifact) =>
          artifact.path === criterion.path &&
          artifactVerification(artifact, state.verification, criteria) === 'verified'
      )
    );
  const outdated = state.artifacts.some(
    (artifact) => artifactVerification(artifact, state.verification, criteria) === 'outdated'
  );
  return (
    <section aria-label="Deliverables" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Deliverables</h2>
        <span className="text-xs text-gray-500">{state.artifacts.length} files</span>
      </div>
      <p className="text-xs leading-relaxed text-gray-500">
        {!criteria.length
          ? 'Files are observed. Add acceptance criteria to a new chat to verify its outputs.'
          : verified && state.verification?.verified && state.verification.outcome === 'verified'
            ? 'All configured acceptance checks passed.'
            : outdated || state.verification?.outcome === 'verified'
              ? 'Verification does not cover the current files. Collect and verify them again.'
              : state.verification?.outcome === 'failed'
                ? 'The latest acceptance check failed. Review the file details.'
                : 'Acceptance checks are pending for the collected files.'}
      </p>
      {!state.artifacts.length && (
        <p className="chat-file-empty">
          No files collected yet. Browse the workspace to collect a deliverable.
        </p>
      )}
      {state.artifacts.map((artifact) => (
        <DeliverableFile
          key={JSON.stringify([
            chat.id,
            artifact.path,
            artifact.sha256.toLowerCase(),
            artifact.size_bytes,
            artifact.media_type,
          ])}
          chat={chat}
          artifact={artifact}
        />
      ))}
      {state.verification && (
        <details className="chat-file-details">
          <summary>Verification receipt</summary>
          <dl className="mt-3 space-y-2 break-all">
            <div>
              <dt>Manifest</dt>
              <dd>{state.verification.manifest_sha256}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>
                {state.verification.evidence_ids.join(', ') || 'No evidence identifiers recorded'}
              </dd>
            </div>
          </dl>
        </details>
      )}
    </section>
  );
}

function DeliverableFile({ chat, artifact }: { chat: ComputerChat; artifact: CollectedArtifact }) {
  const [preview, setPreview] = useState<ArtifactContent>();
  const [operation, setOperation] = useState<'preview' | 'save'>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const alive = useRef(true);
  const pending = useRef(false);
  const previewToggle = useRef<HTMLButtonElement>(null);
  const closePreview = () => {
    setPreview(undefined);
    previewToggle.current?.focus();
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const filename = artifact.path.split('/').pop() || artifact.path;
  const checks =
    chat.serverState?.verification?.checks.filter((check) => check.path === artifact.path) ?? [];
  const result = artifactVerification(
    artifact,
    chat.serverState?.verification ?? null,
    chat.durableSession?.configuration.criteria
  );
  const run = async (kind: 'preview' | 'save') => {
    if (pending.current) return;
    pending.current = true;
    setOperation(kind);
    setError(undefined);
    setMessage(undefined);
    try {
      if (kind === 'preview') {
        const content = await durableChatController.readArtifact(chat.id, artifact.path, artifact);
        if (alive.current) setPreview(content);
      } else {
        const saved = await durableChatController.exportArtifact(chat.id, artifact.path, artifact);
        if (alive.current)
          setMessage(
            saved
              ? window.electronAPI?.computerChat
                ? 'Saved to your device.'
                : 'Download started.'
              : 'Save canceled.'
          );
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      pending.current = false;
      if (alive.current) setOperation(undefined);
    }
  };
  return (
    <article aria-label={filename} className="chat-deliverable">
      <div className="flex items-start gap-2.5">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="break-all text-xs font-medium" title={artifact.path}>
            {filename}
          </h3>
          <p
            className={`mt-1 text-[11px] ${result === 'verified' ? 'text-emerald-400' : result === 'failed' ? 'text-red-400' : 'text-gray-500'}`}
          >
            {result === 'verified'
              ? 'Verified'
              : result === 'failed'
                ? 'Acceptance failed'
                : result === 'outdated'
                  ? 'Checks outdated'
                  : 'Observed'}{' '}
            · {artifact.size_bytes.toLocaleString()} bytes
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="minimal-secondary-button"
          disabled={Boolean(operation)}
          aria-expanded={Boolean(preview)}
          aria-label={`${preview ? 'Close preview of' : 'Preview'} ${filename}`}
          ref={previewToggle}
          onClick={() => (preview ? closePreview() : void run('preview'))}
        >
          <Eye className="h-3 w-3" />
          {operation === 'preview' ? 'Loading…' : preview ? 'Close preview' : 'Preview'}
        </button>
        <button
          type="button"
          className="minimal-secondary-button"
          disabled={Boolean(operation)}
          aria-label={`Save ${filename}`}
          onClick={() => void run('save')}
        >
          <Download className="h-3 w-3" />
          {operation === 'save' ? 'Saving…' : 'Save file'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 break-words text-xs text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs text-gray-500">
          {message}
        </p>
      )}
      {preview && <ArtifactPreview key={preview.sha256} content={preview} onClose={closePreview} />}
      <details className="chat-file-details mt-3">
        <summary>File details and checks</summary>
        <dl className="mt-3 space-y-2 break-all">
          <div>
            <dt>Path</dt>
            <dd>{artifact.path}</dd>
          </div>
          <div>
            <dt>File type</dt>
            <dd>{artifact.media_type}</dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd className="font-mono">{artifact.sha256}</dd>
          </div>
        </dl>
        {result === 'outdated' && (
          <p className="mt-2">The recorded checks belong to different file bytes.</p>
        )}
        {checks.map((check, index) => (
          <p key={index} className="mt-2">
            {check.passed ? 'Passed' : 'Failed'} · {check.kind}: {check.detail}
          </p>
        ))}
      </details>
    </article>
  );
}

function ArtifactPreview({ content, onClose }: { content: ArtifactContent; onClose: () => void }) {
  const [imageError, setImageError] = useState(false);
  const preview = useMemo(() => previewArtifact(content), [content]);
  const filename = content.path.split('/').pop() || content.path;
  return (
    <section aria-label={`Preview of ${filename}`} className="chat-artifact-preview mt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">File preview</span>
        <button
          type="button"
          className="minimal-icon-button"
          aria-label="Close file preview"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {preview.kind === 'text' ? (
        <>
          <pre className="chat-file-text">{preview.text || 'This file is empty.'}</pre>
          {preview.truncated && (
            <p className="mt-2 text-[11px] text-gray-500">
              Preview shortened. Save the file for its complete contents.
            </p>
          )}
        </>
      ) : preview.kind === 'png' && !imageError ? (
        <img
          src={preview.src}
          alt={`Preview of ${filename}`}
          onError={() => setImageError(true)}
          className="max-h-72 w-full object-contain"
        />
      ) : (
        <p className="text-xs text-gray-500">
          {preview.kind === 'unsupported'
            ? preview.message
            : 'This image could not be displayed. You can still save it.'}
        </p>
      )}
    </section>
  );
}
