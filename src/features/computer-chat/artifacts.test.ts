import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  artifactVerification,
  decodeArtifactContent,
  previewArtifact,
  workspaceDirectory,
  type ArtifactContent,
} from './artifacts';
import type { DurableChatStatus } from './durableTypes';
function file(text = 'proof', media_type = 'text/plain') {
  const bytes = Buffer.from(text);
  return {
    path: '/workspace/report.txt',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.length,
    media_type,
    content_base64: bytes.toString('base64'),
  };
}
function content(text: string, type = 'text/plain'): ArtifactContent {
  const record = file(text, type);
  return {
    ...record,
    bytes: new Uint8Array(Buffer.from(text)),
    contentBase64: record.content_base64,
  };
}
beforeEach(() =>
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
);
describe('collected file bytes', () => {
  it.each(['proof', '', 'Unicode 🙂'])('accepts exact bytes including %s', async (text) => {
    const record = file(text);
    const decoded = await decodeArtifactContent(record, record);
    expect(new TextDecoder().decode(decoded.bytes)).toBe(text);
  });
  it.each([
    { path: '/workspace/other.txt' },
    { sha256: 'a'.repeat(64) },
    { size_bytes: 4 },
    { media_type: 'text/html' },
  ])('pins every version field %j', async (patch) => {
    const record = file();
    await expect(decodeArtifactContent({ ...record, ...patch }, record)).rejects.toThrow(
      'changed since collection'
    );
  });
  it.each(['cHJvb2Y=\n', 'cHJvb2Z=', '!!!'])(
    'rejects noncanonical base64 %s',
    async (content_base64) => {
      const record = file();
      await expect(decodeArtifactContent({ ...record, content_base64 }, record)).rejects.toThrow(
        'encoding'
      );
    }
  );
  it('checks decoded length, digest, missing bytes and size bounds', async () => {
    const record = file();
    await expect(
      decodeArtifactContent({ ...record, content_base64: btoa('four') }, record)
    ).rejects.toThrow('size');
    await expect(
      decodeArtifactContent({ ...record, content_base64: btoa('other') }, record)
    ).rejects.toThrow('digest');
    await expect(
      decodeArtifactContent({ ...record, content_base64: undefined }, record)
    ).rejects.toThrow('no artifact bytes');
    const large = file('x'.repeat(131073));
    await expect(decodeArtifactContent(large, large)).rejects.toThrow('128 KiB');
  });
});
describe('digest-bound acceptance', () => {
  const artifact = file();
  const criteria = [{ path: artifact.path, kind: 'contains' as const, expected: 'proof' }];
  function receipt(
    patch: Partial<NonNullable<DurableChatStatus['verification']>> = {}
  ): NonNullable<DurableChatStatus['verification']> {
    return {
      verified: true,
      outcome: 'verified',
      manifest_sha256: 'manifest',
      evidence_ids: [],
      checks: [
        {
          path: artifact.path,
          kind: 'contains',
          passed: true,
          detail: 'Found proof',
          sha256: artifact.sha256,
        },
      ],
      ...patch,
    };
  }
  it('only verifies all configured checks for the current digest', () => {
    expect(artifactVerification(artifact, receipt(), criteria)).toBe('verified');
    expect(artifactVerification(artifact, receipt(), [])).toBe('observed');
    expect(artifactVerification(artifact, receipt(), [...criteria, ...criteria])).toBe('observed');
    expect(
      artifactVerification(artifact, receipt(), [...criteria, { ...criteria[0], kind: 'json' }])
    ).toBe('observed');
    expect(artifactVerification(artifact, receipt({ verified: false }), criteria)).toBe('observed');
    expect(artifactVerification(artifact, receipt({ outcome: 'observed_only' }), criteria)).toBe(
      'observed'
    );
  });
  it('distinguishes outdated, failed and unbound results', () => {
    const check = receipt().checks[0];
    expect(
      artifactVerification(
        artifact,
        receipt({ checks: [{ ...check, sha256: 'f'.repeat(64), passed: false }] }),
        criteria
      )
    ).toBe('outdated');
    expect(
      artifactVerification(artifact, receipt({ checks: [{ ...check, passed: false }] }), criteria)
    ).toBe('failed');
    expect(
      artifactVerification(artifact, receipt({ checks: [{ ...check, sha256: null }] }), criteria)
    ).toBe('observed');
  });
});
describe('bounded passive previews', () => {
  it('formats JSON and leaves HTML as literal text', () => {
    expect(previewArtifact(content('{"ok":true}', 'application/json'))).toEqual({
      kind: 'text',
      text: '{\n  "ok": true\n}',
      truncated: false,
    });
    expect(previewArtifact(content('<script>alert(1)</script>', 'text/html'))).toMatchObject({
      kind: 'text',
      text: '<script>alert(1)</script>',
    });
    expect(previewArtifact(content('x'.repeat(20001)))).toMatchObject({
      kind: 'text',
      text: 'x'.repeat(20000),
      truncated: true,
    });
  });
  it('rejects invalid UTF-8, binary and active SVG content', () => {
    expect(previewArtifact({ ...content(''), bytes: new Uint8Array([255]) })).toMatchObject({
      kind: 'unsupported',
    });
    expect(previewArtifact(content('a\u0000b'))).toMatchObject({ kind: 'unsupported' });
    expect(previewArtifact(content('<svg/>', 'image/svg+xml'))).toMatchObject({
      kind: 'unsupported',
    });
  });
  it('bounds PNG dimensions before asking the browser to decode', () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 100);
    view.setUint32(20, 100);
    const png = {
      ...content('', 'image/png'),
      bytes,
      contentBase64: Buffer.from(bytes).toString('base64'),
    };
    expect(previewArtifact(png)).toMatchObject({ kind: 'png' });
    view.setUint32(16, 8192);
    view.setUint32(20, 8192);
    expect(previewArtifact(png)).toMatchObject({ kind: 'unsupported' });
  });
});
describe('workspace paths', () => {
  it('accepts a workspace path at the engine’s 1024-byte limit', () => {
    const path = '/workspace/' + ('漢'.repeat(50) + '/').repeat(6) + 'a'.repeat(107);
    expect(new TextEncoder().encode(path)).toHaveLength(1024);
    expect(workspaceDirectory(path)).toBe(path);
  });
  it.each(['a', '漢', '🙂'])(
    'rejects an overlong path made from %s before sending it',
    (character) => {
      const size = new TextEncoder().encode(character).byteLength;
      const path = '/workspace/' + character.repeat(Math.floor(1013 / size) + 1);
      expect(new TextEncoder().encode(path).byteLength).toBeGreaterThan(1024);
      expect(() => workspaceDirectory(path)).toThrow('1,024 UTF-8 bytes');
    }
  );
  it('rejects every C1 control character that the engine refuses', () => {
    for (let code = 127; code <= 159; code++)
      expect(() => workspaceDirectory(`/workspace/a${String.fromCharCode(code)}b`)).toThrow(
        'under /workspace'
      );
  });
  it('normalizes paths inside the workspace', () => {
    expect(workspaceDirectory('/workspace//reports/')).toBe('/workspace/reports');
    expect(workspaceDirectory('/workspace/')).toBe('/workspace');
    expect(workspaceDirectory('/workspace/report ')).toBe('/workspace/report ');
  });
  it.each([
    '/workspace/../etc',
    '/workspace/./report',
    '/workspace-other',
    '/etc',
    '/workspace/\\etc',
    '/workspace/a\u0000b',
    '/workspace/file\n',
    ' /workspace/file',
  ])('rejects %s', (path) => expect(() => workspaceDirectory(path)).toThrow('under /workspace'));
});
