/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onDisabled = vi.fn();

  const items = [
    { id: 'edit', label: 'Edit', onClick: onEdit },
    { id: 'disabled', label: 'Unavailable', onClick: onDisabled, disabled: true },
    { id: 'delete', label: 'Delete', onClick: onDelete, danger: true, divider: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderAndOpen(props: { disabled?: boolean } = {}) {
    const utils = render(
      <ContextMenu items={items} {...props}>
        <div>Target area</div>
      </ContextMenu>
    );
    fireEvent.contextMenu(screen.getByText('Target area'), { clientX: 10, clientY: 10 });
    return utils;
  }

  it('does not show the menu initially', () => {
    render(
      <ContextMenu items={items}>
        <div>Target area</div>
      </ContextMenu>
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a labelled menu on right-click', () => {
    renderAndOpen();
    expect(screen.getByRole('menu', { name: 'Context menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('does not open when disabled', () => {
    renderAndOpen({ disabled: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('invokes the item handler and closes on click', () => {
    renderAndOpen();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not invoke disabled items', () => {
    renderAndOpen();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unavailable' }));
    expect(onDisabled).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('marks disabled items as disabled', () => {
    renderAndOpen();
    expect(screen.getByRole('menuitem', { name: 'Unavailable' })).toBeDisabled();
  });

  it('closes on Escape', () => {
    renderAndOpen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when clicking outside', () => {
    renderAndOpen();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves focus with arrow keys, skipping disabled items', () => {
    renderAndOpen();
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(menu).toHaveAttribute('aria-activedescendant', 'ctx-item-edit');

    // Disabled item is skipped
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(menu).toHaveAttribute('aria-activedescendant', 'ctx-item-delete');

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(menu).toHaveAttribute('aria-activedescendant', 'ctx-item-edit');
  });

  it('jumps to first and last enabled items with Home and End', () => {
    renderAndOpen();
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(document, { key: 'End' });
    expect(menu).toHaveAttribute('aria-activedescendant', 'ctx-item-delete');

    fireEvent.keyDown(document, { key: 'Home' });
    expect(menu).toHaveAttribute('aria-activedescendant', 'ctx-item-edit');
  });

  it('activates the focused item with Enter and closes', () => {
    renderAndOpen();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on scroll', () => {
    renderAndOpen();
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
