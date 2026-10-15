import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlaintextConfiguration, resolveStoreKey } from './store-key';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, linkSync: vi.fn(actual.linkSync) };
});

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'stateset-key-test-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true });
});
const filename = (name: string) => path.join(directory, name);

describe('installation configuration keys', () => {
  it('keeps the winning key when another launch publishes one first', () => {
    const winning = 'another-launch'.repeat(4);
    vi.mocked(fs.linkSync).mockImplementationOnce((_source, destination) => {
      fs.writeFileSync(destination, winning, { flag: 'wx', mode: 0o600 });
      throw Object.assign(new Error('Already installed'), { code: 'EEXIST' });
    });
    expect(resolveStoreKey(directory)).toBe(winning);
    expect(fs.readdirSync(directory)).toEqual(['.store-key']);
  });
  it('cleans up temporary key bytes if installation fails', () => {
    vi.mocked(fs.linkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('Disk write failed'), { code: 'EIO' });
    });
    expect(() => resolveStoreKey(directory)).toThrow('Disk write failed');
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it('creates one private random key and retains it across launches', () => {
    const key = resolveStoreKey(directory);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveStoreKey(directory)).toBe(key);
    expect(fs.readdirSync(directory)).toEqual(['.store-key']);
    if (process.platform !== 'win32')
      expect(fs.statSync(filename('.store-key')).mode & 0o777).toBe(0o600);
  });
  it('creates separate keys for separate installations', () => {
    expect(resolveStoreKey(directory)).not.toBe(resolveStoreKey(filename('other')));
  });
  it('preserves managed keys exactly and does not generate another key', () => {
    const configured = ` ${'managed'.repeat(8)} `;
    expect(resolveStoreKey(directory, configured)).toBe(configured);
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it('rejects a short managed key without touching existing data', () => {
    fs.writeFileSync(filename('stateset-config.json'), 'existing encrypted data');
    expect(() => resolveStoreKey(directory, 'short')).toThrow('at least 32');
    expect(fs.readFileSync(filename('stateset-config.json'), 'utf8')).toBe(
      'existing encrypted data'
    );
    expect(fs.readdirSync(directory)).toEqual(['stateset-config.json']);
  });
  it('preserves a previous development key', () => {
    const previous = 'previous-key'.repeat(4);
    fs.writeFileSync(filename('.store-key'), `${previous}\n`);
    expect(resolveStoreKey(directory)).toBe(previous);
    if (process.platform !== 'win32')
      expect(fs.statSync(filename('.store-key')).mode & 0o777).toBe(0o600);
  });
  it('refuses to replace an incomplete key', () => {
    fs.writeFileSync(filename('.store-key'), 'broken');
    expect(() => resolveStoreKey(directory)).toThrow('has not been replaced');
    expect(fs.readFileSync(filename('.store-key'), 'utf8')).toBe('broken');
  });
  it('refuses to generate a key for existing encrypted data whose key was lost', () => {
    fs.writeFileSync(filename('stateset-config.json'), Buffer.from([0, 255, 19, 7]));
    expect(() => resolveStoreKey(directory)).toThrow('original STORE_ENCRYPTION_KEY');
    expect(fs.readdirSync(directory)).toEqual(['stateset-config.json']);
  });
  it('allows legacy plaintext configuration to be encrypted without removing its data', () => {
    const json = JSON.stringify({ theme: 'light', computerChats: [{ id: 'saved-chat' }] });
    fs.writeFileSync(filename('stateset-config.json'), json);
    expect(isPlaintextConfiguration(directory)).toBe(true);
    expect(resolveStoreKey(directory)).toHaveLength(64);
    expect(fs.readFileSync(filename('stateset-config.json'), 'utf8')).toBe(json);
  });
  it('recognizes JSON even when a colon occupies the encrypted-envelope marker position', () => {
    fs.writeFileSync(filename('stateset-config.json'), '{"1234567890123":0}');
    expect(isPlaintextConfiguration(directory)).toBe(true);
  });
  it('does not mistake a ciphertext prefix or corrupt JSON for migratable configuration', () => {
    fs.writeFileSync(filename('stateset-config.json'), '{not-json: encrypted');
    expect(isPlaintextConfiguration(directory)).toBe(false);
    expect(() => resolveStoreKey(directory)).toThrow('encryption key is missing');
  });
  it.skipIf(process.platform === 'win32')(
    'refuses a symlink instead of reading or replacing another file',
    () => {
      const target = filename('external-key');
      fs.writeFileSync(target, 'existing'.repeat(8));
      fs.symlinkSync(target, filename('.store-key'));
      expect(() => resolveStoreKey(directory)).toThrow();
      expect(fs.lstatSync(filename('.store-key')).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('existing'.repeat(8));
    }
  );
});
