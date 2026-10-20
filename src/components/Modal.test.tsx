/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { createContext } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <p>Modal content</p>,
  };

  it('renders when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<Modal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has correct aria attributes', () => {
    render(<Modal {...defaultProps} description="A description" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  it('uses alertdialog role when specified', () => {
    render(<Modal {...defaultProps} role="alertdialog" />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Modal {...defaultProps} description="This is a description" />);
    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when preventClose is true', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} preventClose />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    // Click the overlay (the outermost div)
    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when dialog content is clicked', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Modal content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders close button', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('hides close button when preventClose is true', () => {
    render(<Modal {...defaultProps} preventClose />);
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { rerender } = render(<Modal {...defaultProps} size="sm" />);
    expect(screen.getByRole('dialog').className).toContain('max-w-sm');

    rerender(<Modal {...defaultProps} size="xl" />);
    expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
  });

  it('escapes clipping ancestors while preserving context and React event propagation', () => {
    const WorkspaceContext = createContext('Missing workspace');
    const onAncestorClick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <WorkspaceContext.Provider value="Inventory workspace">
        <div
          style={{ transform: 'translateX(20px)', overflow: 'hidden' }}
          onClick={onAncestorClick}
        >
          <Modal {...defaultProps} onClose={onClose}>
            <WorkspaceContext.Consumer>
              {(workspace) => <button type="button">{workspace}</button>}
            </WorkspaceContext.Consumer>
          </Modal>
        </div>
      </WorkspaceContext.Provider>
    );

    const dialog = screen.getByRole('dialog', { name: 'Test Modal' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(within(container).queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inventory workspace' }));
    expect(onAncestorClick).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up the body portal, scroll lock and Escape listener on close and unmount', () => {
    const onClose = vi.fn();
    const previousOverflow = document.body.style.overflow;
    const view = (isOpen: boolean) => (
      <div style={{ transform: 'translateX(20px)', overflow: 'hidden' }}>
        <Modal {...defaultProps} isOpen={isOpen} onClose={onClose} />
      </div>
    );
    const { rerender, unmount } = render(view(true));
    const firstOverlay = screen.getByRole('dialog').parentElement!;
    expect(document.body.style.overflow).toBe('hidden');

    rerender(view(false));
    expect(firstOverlay.isConnected).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(view(true));
    const reopenedOverlay = screen.getByRole('dialog').parentElement!;
    expect(reopenedOverlay.parentElement).toBe(document.body);
    expect(reopenedOverlay).not.toBe(firstOverlay);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(reopenedOverlay.isConnected).toBe(false);
    expect(document.body.style.overflow).toBe(previousOverflow);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps dismissal guarded in the body portal and allows it after unlocking', () => {
    const onClose = vi.fn();
    const view = (preventClose: boolean) => (
      <div style={{ transform: 'translateX(20px)', overflow: 'hidden' }}>
        <Modal {...defaultProps} onClose={onClose} preventClose={preventClose} />
      </div>
    );
    const { rerender } = render(view(true));
    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.click(overlay);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(view(false));
    fireEvent.click(screen.getByText('Modal content'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
