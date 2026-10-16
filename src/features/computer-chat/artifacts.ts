import type { z } from 'zod';
import type { artifactSchema, DurableChatConfiguration, DurableChatStatus } from './durableTypes';

export type CollectedArtifact = z.infer<typeof artifactSchema>;
export interface ArtifactVersion {
  path: string;
  sha256: string;
  size_bytes: number;
  media_type: string;
}
export interface ArtifactContent extends ArtifactVersion {
  bytes: Uint8Array;
  contentBase64: string;
}
export const MAX_ARTIFACT_BYTES = 131072;
const hasControls = (text: string, allowWhitespace = false) =>
  Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code < 32 || code === 127) && !(allowWhitespace && ['\t', '\n', '\r'].includes(character))
    );
  });

export function sameArtifactVersion(a: ArtifactVersion, b: ArtifactVersion) {
  return (
    a.path === b.path &&
    a.sha256.toLowerCase() === b.sha256.toLowerCase() &&
    a.size_bytes === b.size_bytes &&
    a.media_type === b.media_type
  );
}

/** Accept only the exact collected version, including canonical base64 and byte count. */
export async function decodeArtifactContent(
  record: CollectedArtifact,
  expected: ArtifactVersion
): Promise<ArtifactContent> {
  if (!sameArtifactVersion(record, expected))
    throw new Error('This file has changed since collection. Collect and verify it again.');
  if (record.content_base64 === undefined) throw new Error('The engine returned no artifact bytes');
  if (record.content_base64.length > 180000 || record.size_bytes > MAX_ARTIFACT_BYTES)
    throw new Error('Files are limited to 128 KiB');
  let raw: string;
  try {
    raw = atob(record.content_base64);
    if (btoa(raw) !== record.content_base64) throw new Error('Noncanonical base64');
  } catch {
    throw new Error('The engine returned invalid file encoding');
  }
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (bytes.byteLength !== record.size_bytes || bytes.byteLength > MAX_ARTIFACT_BYTES)
    throw new Error('File size does not match the collected artifact');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (hash !== expected.sha256.toLowerCase())
    throw new Error('Artifact bytes do not match the recorded digest');
  return { ...expected, bytes, contentBase64: record.content_base64 };
}

export function artifactVerification(
  artifact: ArtifactVersion,
  verification: DurableChatStatus['verification'],
  criteria: DurableChatConfiguration['criteria'] = []
): 'observed' | 'verified' | 'failed' | 'outdated' {
  const required = criteria.filter((criterion) => criterion.path === artifact.path);
  const checks = verification?.checks.filter((check) => check.path === artifact.path) ?? [];
  if (!required.length || !checks.length || verification?.outcome === 'observed_only')
    return 'observed';
  if (
    checks.some(
      (check) => check.sha256 && check.sha256.toLowerCase() !== artifact.sha256.toLowerCase()
    )
  )
    return 'outdated';
  if (checks.some((check) => !check.passed)) return 'failed';
  if (checks.some((check) => !check.sha256)) return 'observed';
  for (const kind of new Set(required.map((criterion) => criterion.kind))) {
    if (
      checks.filter((check) => check.kind === kind).length <
      required.filter((criterion) => criterion.kind === kind).length
    )
      return 'observed';
  }
  return verification?.verified && verification.outcome === 'verified' ? 'verified' : 'observed';
}

export function previewArtifact(
  content: ArtifactContent
):
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'png'; src: string }
  | { kind: 'unsupported'; message: string } {
  const type = content.media_type.split(';')[0].trim().toLowerCase();
  if (type === 'image/png') {
    const bytes = content.bytes;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    if (bytes.length >= 24 && signature.every((byte, index) => bytes[index] === byte)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16),
        height = view.getUint32(20);
      if (width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16777216)
        return { kind: 'png', src: `data:image/png;base64,${content.contentBase64}` };
    }
    return {
      kind: 'unsupported',
      message: 'This image cannot be previewed here. Save it to inspect it.',
    };
  }
  const json = type === 'application/json' || type.endsWith('+json');
  if (type.startsWith('text/') || json) {
    try {
      let text = new TextDecoder('utf-8', { fatal: true }).decode(content.bytes);
      if (hasControls(text, true)) throw new Error('Binary content');
      if (json) {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* Keep malformed JSON visible as plain text. */
        }
      }
      return { kind: 'text', text: text.slice(0, 20000), truncated: text.length > 20000 };
    } catch {
      /* Binary or invalid UTF-8 is available through file saving. */
    }
  }
  return {
    kind: 'unsupported',
    message:
      'Preview is available for UTF-8 text, JSON and PNG files. You can still save this file.',
  };
}

export function workspaceDirectory(value: string) {
  const path = value.replace(/\/+$/, '') || '/';
  if (new TextEncoder().encode(path).byteLength > 1024)
    throw new Error('Workspace paths can use at most 1,024 UTF-8 bytes.');
  if (
    path.includes('\\') ||
    Array.from(path).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    }) ||
    (path !== '/workspace' && !path.startsWith('/workspace/')) ||
    path.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error(
      'Choose a directory under /workspace without . or .. segments, backslashes or control characters.'
    );
  return path.replace(/\/{2,}/g, '/');
}
