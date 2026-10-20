import { workspaceDirectory } from './artifacts';

export type FileCheckKind = 'contains' | 'equals' | 'sha256';
export interface FileCheckInput {
  path: string;
  kind: FileCheckKind;
  expected: string;
}

export class FileCheckInputError extends Error {
  constructor(
    readonly field: 'path' | 'kind' | 'expected',
    message: string
  ) {
    super(message);
    this.name = 'FileCheckInputError';
  }
}

/** Shared by the form and execution boundary; validation never performs I/O. */
export function fileCheckCriterion(input: FileCheckInput): FileCheckInput {
  let path: string;
  try {
    path = workspaceDirectory(input.path);
  } catch {
    throw new FileCheckInputError(
      'path',
      'Use a file path under /workspace without . or .. segments, backslashes or control characters, up to 1,024 UTF-8 bytes.'
    );
  }
  if (input.path.endsWith('/') || path === '/workspace')
    throw new FileCheckInputError('path', 'Choose a file under /workspace.');
  if (!['contains', 'equals', 'sha256'].includes(input.kind))
    throw new FileCheckInputError('kind', 'Choose a supported file check.');
  const expected = input.kind === 'sha256' ? input.expected.trim().toLowerCase() : input.expected;
  if (input.kind === 'contains' && !expected.length)
    throw new FileCheckInputError('expected', 'Enter the text the file must contain.');
  if (input.kind === 'sha256' && !/^[a-f0-9]{64}$/.test(expected))
    throw new FileCheckInputError('expected', 'Enter a 64-character SHA-256 digest.');
  if (new TextEncoder().encode(JSON.stringify(expected)).byteLength > 16384)
    throw new FileCheckInputError(
      'expected',
      'Expected values can use at most 16,384 JSON-encoded bytes.'
    );
  return { path, kind: input.kind, expected };
}
