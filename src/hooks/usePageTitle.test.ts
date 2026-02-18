/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle';

describe('usePageTitle', () => {
  afterEach(() => {
    document.title = '';
  });

  it('sets document.title on mount', () => {
    renderHook(() => usePageTitle('Dashboard'));
    expect(document.title).toBe('Dashboard — StateSet');
  });

  it('restores base title on unmount', () => {
    const { unmount } = renderHook(() => usePageTitle('Settings'));
    expect(document.title).toBe('Settings — StateSet');
    unmount();
    expect(document.title).toBe('StateSet');
  });

  it('updates title when page prop changes', () => {
    const { rerender } = renderHook(({ page }) => usePageTitle(page), {
      initialProps: { page: 'Dashboard' },
    });
    expect(document.title).toBe('Dashboard — StateSet');

    rerender({ page: 'Settings' });
    expect(document.title).toBe('Settings — StateSet');
  });
});
