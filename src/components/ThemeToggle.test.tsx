/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeToggle, AnimatedThemeToggle } from './ThemeToggle';
import { usePreferencesStore } from '../stores/preferences';
import { mockElectronAPI } from '../test-utils';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    span: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>): JSX.Element => (
      <span {...filterDomProps(props)}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, className, ...rest } = props;
  return { className: className as string, ...rest };
}

describe('ThemeToggle', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electronAPI = mockElectronAPI();
    usePreferencesStore.setState({ theme: 'dark' });
    document.documentElement.dataset.theme = 'dark';
  });

  it('renders an icon-only button with an accessible label in dark mode', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('toggles to light theme on click and updates the document', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    // Label flips so the button always names the action it performs
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('persists the theme preference via the electron store', async () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('theme', 'light');
    });
  });

  it('toggles back to dark from light mode', async () => {
    usePreferencesStore.setState({ theme: 'light' });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(usePreferencesStore.getState().theme).toBe('dark');
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  it('shows a text label when showLabel is set', () => {
    render(<ThemeToggle showLabel />);
    expect(screen.getByText('Light Mode')).toBeInTheDocument();
  });
});

describe('AnimatedThemeToggle', () => {
  beforeEach(() => {
    mockElectronAPI();
    usePreferencesStore.setState({ theme: 'dark' });
  });

  it('renders as an accessible switch reflecting the current theme', () => {
    render(<AnimatedThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Switch to light theme' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('switches the theme and updates aria-checked on click', () => {
    render(<AnimatedThemeToggle />);
    fireEvent.click(screen.getByRole('switch'));

    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
