/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a modal dialog with an accessible title', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
  });

  it('lists global and navigation shortcut groups', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument();
    expect(screen.getByText('Open command palette')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
  });

  it('shows dashboard shortcuts on the dashboard route', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />, { route: '/' });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Focus search')).toBeInTheDocument();
  });

  it('shows agent console shortcuts on an agent route', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />, {
      route: '/agent/abc-123',
    });
    expect(screen.getByRole('heading', { name: 'Agent Console' })).toBeInTheDocument();
    expect(screen.getByText('Search in conversation')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not listen for Escape while closed', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose from the close button', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when clicking inside the dialog', () => {
    renderWithProviders(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Keyboard Shortcuts' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
