/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('calculates totalPages correctly', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalItems).toBe(25);
    expect(result.current.itemsPerPage).toBe(10);
  });

  it('returns correct items for page 1', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    const page1 = result.current.getPageItems(1);
    expect(page1).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('returns correct items for page 2', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    const page2 = result.current.getPageItems(2);
    expect(page2).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('returns remaining items for last page', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    const page3 = result.current.getPageItems(3);
    expect(page3).toEqual([21, 22, 23, 24, 25]);
  });

  it('handles empty array', () => {
    const { result } = renderHook(() => usePagination([], 10));
    expect(result.current.totalPages).toBe(0);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.getPageItems(1)).toEqual([]);
  });

  it('defaults to 10 items per page for invalid values', () => {
    const { result: r1 } = renderHook(() => usePagination(items, 0));
    expect(r1.current.itemsPerPage).toBe(10);

    const { result: r2 } = renderHook(() => usePagination(items, -5));
    expect(r2.current.itemsPerPage).toBe(10);

    const { result: r3 } = renderHook(() => usePagination(items, NaN));
    expect(r3.current.itemsPerPage).toBe(10);
  });

  it('works with custom page size', () => {
    const { result } = renderHook(() => usePagination(items, 5));
    expect(result.current.totalPages).toBe(5);
    expect(result.current.getPageItems(1)).toEqual([1, 2, 3, 4, 5]);
  });
});
