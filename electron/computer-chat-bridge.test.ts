import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CHAT_CONFIGURATION } from '../src/features/computer-chat/durableTypes';
import { importChatMessages } from '../src/features/computer-chat/history';
import {
  createComputerChatConnection,
  validateComputerChatRequest,
  engineBaseUrl,
  requestComputerChat,
  decodeArtifact,
  writeArtifactFile,
} from './computer-chat-bridge';
describe('computer chat IPC boundary', () => {
  it('forwards bounded history and acceptance criteria that exceed the old request cap', async () => {
    const body = {
      request_id: crypto.randomUUID(),
      brand_id: '22222222-2222-4222-8222-222222222222',
      ...DEFAULT_CHAT_CONFIGURATION,
      imported_messages: importChatMessages(
        Array.from({ length: 30 }, () => ({ role: 'user', content: 'a'.repeat(8000) }))
      ),
      criteria: Array.from({ length: 8 }, (_, index) => ({
        path: `/workspace/report-${index % 4}.txt`,
        kind: 'contains',
        expected: 'a'.repeat(16382),
      })),
    };
    const serialized = JSON.stringify(body);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeGreaterThan(262144);
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    const result = await requestComputerChat(
      {
        engineUrl: 'https://engine.example',
        revision: 'revision',
        path: '/v1/computer-chats/start',
        method: 'POST',
        tenantId: 'tenant',
        body,
      },
      { url: 'https://engine.example', apiKey: 'key', revision: 'revision' },
      fetcher
    );
    expect(result.ok).toBe(true);
    expect(fetcher.mock.calls[0][1].body).toBe(serialized);
  });
  it.each(['a', '🙂'])('bounds serialized %s request content in UTF-8 bytes', (character) => {
    const request = {
      engineUrl: 'https://engine.example',
      revision: 'revision',
      path: '/v1/computer-chats/diagnostics',
      method: 'POST',
      tenantId: 'tenant',
    };
    const body = character.repeat(
      Math.floor((2 * 1024 * 1024 - 2) / Buffer.byteLength(character, 'utf8'))
    );
    expect(() => validateComputerChatRequest({ ...request, body })).not.toThrow();
    expect(() => validateComputerChatRequest({ ...request, body: body + character })).toThrow(
      'request is too large'
    );
  });
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
        engineUrl: 'https://engine.example',
        revision: 'revision',
        path: '/v1/computer-chats/diagnostics',
        method: 'POST',
        tenantId: 'tenant',
        body: { brand_id: 'brand' },
      },
      { url: 'https://engine.example', apiKey: 'key', revision: 'revision' },
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

describe('native computer connection revisions', () => {
  const configuration = { url: 'https://engine.example', apiKey: 'private-key' };
  const request = {
    path: '/v1/computer-chats/diagnostics',
    method: 'POST' as const,
    tenantId: 'tenant',
    body: { brand_id: 'brand' },
  };
  it('keeps a revision stable until configuration changes or is invalidated', () => {
    const connection = createComputerChatConnection();
    const first = connection.read(configuration);
    expect(connection.read(configuration)).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('private-key');
    const rotated = connection.read({ ...configuration, apiKey: 'replacement-key' });
    expect(rotated.revision).not.toBe(first.revision);
    connection.invalidate();
    expect(connection.read(configuration).revision).not.toBe(first.revision);
  });
  it.each(['engine', 'credential'])(
    'never dispatches a request bound to the previous %s',
    async (change) => {
      const connection = createComputerChatConnection();
      const old = connection.read(configuration);
      const next =
        change === 'engine'
          ? { ...configuration, url: 'https://next.example' }
          : { ...configuration, apiKey: 'replacement-key' };
      const current = connection.read(next);
      const fetcher = vi.fn();
      await expect(
        requestComputerChat(
          { ...request, ...old },
          { ...next, revision: current.revision },
          fetcher
        )
      ).rejects.toThrow('connection changed');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it('refuses a forged destination even with a current revision', async () => {
    const connection = createComputerChatConnection().read(configuration);
    const fetcher = vi.fn();
    await expect(
      requestComputerChat(
        { ...request, ...connection, engineUrl: 'https://different.example' },
        { ...configuration, revision: connection.revision },
        fetcher
      )
    ).rejects.toThrow('connection changed');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not retry old authentication after a connection change', async () => {
    const connection = createComputerChatConnection().read(configuration);
    let current = true;
    const fetcher = vi.fn().mockImplementation(async () => {
      current = false;
      return new Response('', { status: 401 });
    });
    await expect(
      requestComputerChat(
        { ...request, ...connection },
        { ...configuration, revision: connection.revision },
        fetcher,
        () => current
      )
    ).rejects.toThrow('connection changed');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
