import { describe, it, expect } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  describe('sessions', () => {
    it('all is a stable reference', () => {
      expect(queryKeys.sessions.all).toEqual(['sessions']);
    });

    it('list includes tenantId and brandId', () => {
      const key = queryKeys.sessions.list('t1', 'b1');
      expect(key).toEqual(['sessions', 't1', 'b1']);
    });

    it('list with undefined brandId', () => {
      const key = queryKeys.sessions.list('t1');
      expect(key).toEqual(['sessions', 't1', undefined]);
    });

    it('detail includes sessionId', () => {
      const key = queryKeys.sessions.detail('sess-1');
      expect(key).toEqual(['session', 'sess-1']);
    });
  });

  describe('connections', () => {
    it('all is a stable reference', () => {
      expect(queryKeys.connections.all).toEqual(['connections']);
    });

    it('list includes tenantId and brandId', () => {
      expect(queryKeys.connections.list('t1', 'b1')).toEqual(['connections', 't1', 'b1']);
    });

    it('platform includes all IDs', () => {
      expect(queryKeys.connections.platform('t1', 'b1', 'shopify')).toEqual([
        'connections',
        't1',
        'b1',
        'shopify',
      ]);
    });
  });

  describe('brands', () => {
    it('all is a stable reference', () => {
      expect(queryKeys.brands.all).toEqual(['brands']);
    });

    it('list includes tenantId', () => {
      expect(queryKeys.brands.list('t1')).toEqual(['brands', 't1']);
    });

    it('detail includes tenantId and brandId', () => {
      expect(queryKeys.brands.detail('t1', 'b1')).toEqual(['brands', 't1', 'b1']);
    });
  });

  describe('hierarchy', () => {
    it('sessions.all is a prefix of sessions.list', () => {
      const all = queryKeys.sessions.all;
      const list = queryKeys.sessions.list('t1', 'b1');
      expect(list.slice(0, all.length)).toEqual(all);
    });
  });
});
