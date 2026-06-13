/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ToastProvider } from '../../../components/ToastProvider';
import { useSessionExports } from './useSessionExports';
import { makeSession } from '../testing/fixtures';
import {
  exportSessions,
  exportMetricsSummary,
  exportRunSummary,
  copyToClipboard,
} from '../../../lib/export';

vi.mock('../../../lib/export', () => ({
  exportSessions: vi.fn(),
  exportMetricsSummary: vi.fn(),
  exportRunSummary: vi.fn(),
  copyToClipboard: vi.fn(async () => true),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useSessionExports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports sessions as JSON', () => {
    const sessions = [makeSession()];
    const { result } = renderHook(() => useSessionExports(sessions), { wrapper });

    act(() => result.current.handleExportJSON());
    expect(exportSessions).toHaveBeenCalledWith(sessions, { format: 'json' });
  });

  it('exports sessions as CSV', () => {
    const sessions = [makeSession()];
    const { result } = renderHook(() => useSessionExports(sessions), { wrapper });

    act(() => result.current.handleExportCSV());
    expect(exportSessions).toHaveBeenCalledWith(sessions, { format: 'csv' });
  });

  it('exports the metrics summary', () => {
    const sessions = [makeSession()];
    const { result } = renderHook(() => useSessionExports(sessions), { wrapper });

    act(() => result.current.handleExportMetrics());
    expect(exportMetricsSummary).toHaveBeenCalledWith(sessions);
  });

  it('copies a session summary to the clipboard', async () => {
    const session = makeSession({ id: 'sess-copy' });
    const { result } = renderHook(() => useSessionExports([session]), { wrapper });

    await act(async () => {
      await result.current.handleCopySession(session);
    });
    expect(copyToClipboard).toHaveBeenCalledWith({
      id: session.id,
      agent_type: session.agent_type,
      status: session.status,
      metrics: session.metrics,
    });
  });

  it('exports a run summary for a single session', () => {
    const session = makeSession();
    const { result } = renderHook(() => useSessionExports([session]), { wrapper });

    act(() => result.current.handleExportRunSummary(session));
    expect(exportRunSummary).toHaveBeenCalledWith(session);
  });
});
