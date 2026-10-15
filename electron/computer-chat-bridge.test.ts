import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateComputerChatRequest,
  engineBaseUrl,
  requestComputerChat,
  decodeArtifact,
  writeArtifactFile,
} from './computer-chat-bridge';
describe('computer chat IPC boundary', () => {
  it.each([
    '/admin',
    'https://attacker.example/v1/computer-chats/start',
    '/v1/computer-chats/../admin',
    '/v1/computer-chats/start?token=secret',
  ])('rejects unapproved paths %s', (path) =>
    expect(() =>
      validateComputerChatRequest({ path, method: 'POST', tenantId: 'tenant' })
    ).toThrow()
  );
  it('keeps remote engines on HTTPS and refuses embedded credentials', () => {
    expect(() => engineBaseUrl('http://remote.example')).toThrow();
    expect(() => engineBaseUrl('https://user:password@example.com')).toThrow();
    expect(engineBaseUrl('http://127.0.0.1:8081')).toBe('http://127.0.0.1:8081');
  });
  it('retries only authentication and does not follow credential-bearing redirects', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true })));
    const result = await requestComputerChat(
      {
        path: '/v1/computer-chats/diagnostics',
        method: 'POST',
        tenantId: 'tenant',
        body: { brand_id: 'brand' },
      },
      { url: 'https://engine.example', apiKey: 'key' },
      fetcher
    );
    expect(result.ok).toBe(true);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'ApiKey key' },
    });
  });
  it('validates exact artifact bytes before offering an export', () => {
    const bytes = Buffer.from('proof');
    const input = {
      filename: '../report.txt',
      contentBase64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    expect(decodeArtifact(input).bytes.toString()).toBe('proof');
    expect(decodeArtifact(input).filename).not.toContain('/');
    expect(() =>
      decodeArtifact({ ...input, contentBase64: Buffer.from('changed').toString('base64') })
    ).toThrow();
  });
});

describe('native artifact replacement', () => {
  const directories: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      directories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true }))
    );
  });
  async function destination() {
    const directory = await fs.mkdtemp(join(tmpdir(), 'stateset-export-'));
    directories.push(directory);
    return { directory, path: join(directory, 'report.txt') };
  }
  it('replaces a file only after writing the complete new contents', async () => {
    const { directory, path } = await destination();
    await fs.writeFile(path, 'original');
    await writeArtifactFile(path, Buffer.from('new proof'));
    expect(await fs.readFile(path, 'utf8')).toBe('new proof');
    expect(await fs.readdir(directory)).toEqual(['report.txt']);
    if (process.platform !== 'win32') expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
  });
  it('preserves the existing file and removes its temporary file if replacement fails', async () => {
    const { directory, path } = await destination();
    await fs.writeFile(path, 'original');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('Disk replacement failed'));
    await expect(writeArtifactFile(path, Buffer.from('new proof'))).rejects.toThrow(
      'Disk replacement failed'
    );
    expect(await fs.readFile(path, 'utf8')).toBe('original');
    expect(await fs.readdir(directory)).toEqual(['report.txt']);
  });
  it('rejects noncanonical native base64 even with the correct digest', () => {
    const bytes = Buffer.from('proof');
    const input = {
      filename: 'report.txt',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentBase64: bytes.toString('base64') + '\n',
    };
    expect(() => decodeArtifact(input)).toThrow();
  });
});
