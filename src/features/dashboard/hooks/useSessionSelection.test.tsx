/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionSelection } from './useSessionSelection';
import { makeSession } from '../testing/fixtures';

describe('useSessionSelection', () => {
  it('starts with an empty selection', () => {
    const { result } = renderHook(() => useSessionSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggles individual ids', () => {
    const { result } = renderHook(() => useSessionSelection());

    act(() => result.current.toggleSelect('a'));
    expect(result.current.selectedIds.has('a')).toBe(true);

    act(() => result.current.toggleSelect('b'));
    expect(result.current.selectedIds.size).toBe(2);

    act(() => result.current.toggleSelect('a'));
    expect(result.current.selectedIds.has('a')).toBe(false);
    expect(result.current.selectedIds.size).toBe(1);
  });

  it('selects all visible sessions', () => {
    const visible = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const { result } = renderHook(() => useSessionSelection());

    act(() => result.current.selectAllVisible(visible));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b']));
  });

  it('clears the selection when all visible sessions are already selected', () => {
    const visible = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const { result } = renderHook(() => useSessionSelection());

    act(() => result.current.selectAllVisible(visible));
    act(() => result.current.selectAllVisible(visible));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('clearSelection empties the set', () => {
    const { result } = renderHook(() => useSessionSelection());

    act(() => result.current.toggleSelect('a'));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });
});
