import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const STORE_NAME = 'stateset-config.json';
const KEY_NAME = '.store-key';
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Recognize legacy JSON without mistaking the current encrypted envelope for JSON. */
export function isPlaintextConfiguration(userData: string): boolean {
  let descriptor: number;
  try {
    descriptor = fs.openSync(path.join(userData, STORE_NAME), 'r');
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  try {
    const prefix = Buffer.alloc(64);
    const size = fs.readSync(descriptor, prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, size).toString('utf8').trimStart().startsWith('{')) return false;
    try {
      const value: unknown = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    } catch (error) {
      if (error instanceof SyntaxError) return false;
      throw error;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function readKey(filename: string): string {
  if (!fs.lstatSync(filename).isFile())
    throw new Error(
      'The configuration key must be a regular private file. Restore .store-key from backup.'
    );
  const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const metadata = fs.fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size > 4096)
      throw new Error(
        'The configuration key is not a valid private key file. Restore .store-key from backup.'
      );
    const key = fs.readFileSync(descriptor, 'utf8').trim();
    if (key.length < 32)
      throw new Error(
        'The configuration key is incomplete. Restore .store-key from backup; it has not been replaced.'
      );
    if (process.platform !== 'win32' && metadata.mode & 0o077) fs.fchmodSync(descriptor, 0o600);
    return key;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Keep existing identities readable; never replace a damaged or missing encryption key. */
export function resolveStoreKey(userData: string, configuredKey?: string): string {
  if (configuredKey) {
    if (configuredKey.trim().length < 32)
      throw new Error(
        'STORE_ENCRYPTION_KEY must contain at least 32 non-padding characters. Existing configuration has not been changed.'
      );
    return configuredKey;
  }
  const keyPath = path.join(userData, KEY_NAME);
  try {
    return readKey(keyPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  let hasConfiguration = false;
  try {
    const metadata = fs.lstatSync(path.join(userData, STORE_NAME));
    if (!metadata.isFile())
      throw new Error(
        'The configuration must be a regular file. Existing data has not been changed.'
      );
    hasConfiguration = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (hasConfiguration && !isPlaintextConfiguration(userData))
    throw new Error(
      'The configuration encryption key is missing. Restore .store-key or the original STORE_ENCRYPTION_KEY to open your saved data. Existing configuration has not been changed.'
    );

  fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
  const temporary = path.join(userData, `.store-key-${randomUUID()}.tmp`);
  const key = randomBytes(32).toString('hex');
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  let open = true;
  try {
    fs.writeFileSync(descriptor, key);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    open = false;
    try {
      // Publish a complete key atomically, without overwriting another launch's key.
      fs.linkSync(temporary, keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return readKey(keyPath);
    }
    if (process.platform !== 'win32') {
      const directory = fs.openSync(userData, 'r');
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    }
    return key;
  } finally {
    if (open) fs.closeSync(descriptor);
    fs.unlinkSync(temporary);
  }
}
