/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import App from './App';
import { mockElectronAPI } from './test-utils';
import { useAuthStore } from './stores/auth';
import { usePreferencesStore } from './stores/preferences';
import { useAuditLogStore } from './stores/auditLog';

vi.mock('./components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <>
      <nav aria-label="Workspace navigation">Workspace</nav>
      {children}
    </>
  ),
}));
vi.mock('./components/OfflineBanner', () => ({ default: () => null }));
vi.mock('./pages/Dashboard', () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock('./pages/ChatPlayground', () => ({ default: () => <h1>Chats</h1> }));
vi.mock('./pages/Login', () => ({ default: () => <h1>Sign in</h1> }));
vi.mock('./hooks/useComputerChatRecovery', () => ({ useComputerChatRecovery: () => {} }));
vi.mock('./hooks/useBackgroundAgents', () => ({ useBackgroundAgents: () => {} }));
vi.mock('./hooks/useDurableWorkflowMonitor', () => ({ useDurableWorkflowMonitor: () => {} }));
vi.mock('./hooks/useDurableWorkflowScheduler', () => ({ useDurableWorkflowScheduler: () => {} }));

describe('App route recovery', () => {
  beforeEach(() => {
    mockElectronAPI().app.isE2ETest = true;
    window.history.replaceState({}, '', '/missing-page?from=stale-link');
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      error: null,
      initialize: vi.fn().mockResolvedValue(undefined),
    });
    usePreferencesStore.setState({
      initialized: true,
      reduceMotion: true,
      initialize: vi.fn().mockResolvedValue(undefined),
    });
    useAuditLogStore.setState({ initialize: vi.fn().mockResolvedValue(undefined) });
  });

  it('shows a focused, named recovery screen for an unknown authenticated route', async () => {
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'Page not found' });
    expect(heading).toHaveFocus();
    expect(document.title).toBe('Page not found — StateSet');
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
  });

  it.each([
    ['Back to Dashboard', 'Dashboard'],
    ['Open chats', 'Chats'],
  ])('recovers through %s without replacing the document', async (action, destination) => {
    const sentinel = document.createElement('div');
    sentinel.id = 'retained-document';
    document.body.append(sentinel);
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole('link', { name: action }));
      expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument();
      expect(document.getElementById('retained-document')).toBe(sentinel);
      expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
    } finally {
      sentinel.remove();
    }
  });

  it('requires sign-in before showing workspace recovery destinations', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open chats' })).not.toBeInTheDocument();
  });
});
