import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RequestDeduplicator,
  apiDeduplicator,
  createRequestKey,
  deduplicatedFetch,
} from './requestDeduplication';

describe('RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator({ ttlMs: 100, maxEntries: 10 });
  });

  afterEach(() => {
    deduplicator.clear();
  });

  it('should deduplicate concurrent identical requests', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'result';
    });

    // Make 3 concurrent requests with the same key
    const results = await Promise.all([
      deduplicator.dedupe('key1', fetchFn),
      deduplicator.dedupe('key1', fetchFn),
      deduplicator.dedupe('key1', fetchFn),
    ]);

    // All should get the same result
    expect(results).toEqual(['result', 'result', 'result']);
    // But the function should only be called once
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should not deduplicate requests with different keys', async () => {
    const fetchFn = vi.fn(async (key: string) => key);

    const [result1, result2] = await Promise.all([
      deduplicator.dedupe('key1', () => fetchFn('key1')),
      deduplicator.dedupe('key2', () => fetchFn('key2')),
    ]);

    expect(result1).toBe('key1');
    expect(result2).toBe('key2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should allow new requests after TTL expires', async () => {
    const fetchFn = vi.fn(async () => 'result');

    await deduplicator.dedupe('key1', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    await deduplicator.dedupe('key1', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should propagate errors', async () => {
    const error = new Error('Test error');
    const fetchFn = vi.fn(async () => {
      throw error;
    });

    await expect(deduplicator.dedupe('key1', fetchFn)).rejects.toThrow('Test error');
  });

  it('should enforce max entries', async () => {
    const smallDeduplicator = new RequestDeduplicator({ ttlMs: 1000, maxEntries: 3 });

    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      await smallDeduplicator.dedupe(`key${i}`, async () => `result${i}`);
    }

    // Should only have 3 entries (the most recent ones)
    expect(smallDeduplicator.size).toBeLessThanOrEqual(3);
  });

  it('should report correct size', () => {
    expect(deduplicator.size).toBe(0);

    deduplicator.dedupe('key1', async () => 'result1');
    expect(deduplicator.size).toBe(1);

    deduplicator.dedupe('key2', async () => 'result2');
    expect(deduplicator.size).toBe(2);
  });

  it('should clear all entries', async () => {
    await deduplicator.dedupe('key1', async () => 'result1');
    await deduplicator.dedupe('key2', async () => 'result2');
    expect(deduplicator.size).toBe(2);

    deduplicator.clear();
    expect(deduplicator.size).toBe(0);
  });
});

describe('createRequestKey', () => {
  it('should create consistent keys', () => {
    const key1 = createRequestKey('GET', '/api/users');
    const key2 = createRequestKey('GET', '/api/users');
    expect(key1).toBe(key2);
  });

  it('should differentiate by method', () => {
    const getKey = createRequestKey('GET', '/api/users');
    const postKey = createRequestKey('POST', '/api/users');
    expect(getKey).not.toBe(postKey);
  });

  it('should differentiate by path', () => {
    const key1 = createRequestKey('GET', '/api/users');
    const key2 = createRequestKey('GET', '/api/posts');
    expect(key1).not.toBe(key2);
  });

  it('should include params in key', () => {
    const key1 = createRequestKey('GET', '/api/users', { page: 1 });
    const key2 = createRequestKey('GET', '/api/users', { page: 2 });
    expect(key1).not.toBe(key2);
  });

  it('should handle undefined params', () => {
    const key1 = createRequestKey('GET', '/api/users');
    const key2 = createRequestKey('GET', '/api/users', undefined);
    expect(key1).toBe(key2);
  });
});

describe('apiDeduplicator', () => {
  it('should be a global instance', () => {
    expect(apiDeduplicator).toBeInstanceOf(RequestDeduplicator);
  });
});

describe('deduplicatedFetch', () => {
  it('should deduplicate fetch calls', async () => {
    const fetchFn = vi.fn(async () => 'result');

    const results = await Promise.all([
      deduplicatedFetch('test-key', fetchFn),
      deduplicatedFetch('test-key', fetchFn),
    ]);

    expect(results).toEqual(['result', 'result']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
