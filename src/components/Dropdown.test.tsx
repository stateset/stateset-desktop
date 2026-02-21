/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown, type DropdownItem } from './Dropdown';

beforeAll(() => {
  // scrollIntoView is not implemented in jsdom
  Element.prototype.scrollIntoView = vi.fn();
});

const items: DropdownItem[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
];

function renderDropdown(overrides?: Partial<Parameters<typeof Dropdown>[0]>) {
  const onSelect = vi.fn();
  const result = render(
    <Dropdown trigger={<button>Menu</button>} items={items} onSelect={onSelect} {...overrides} />
  );
  return { ...result, onSelect };
}

describe('Dropdown', () => {
  it('renders trigger but not menu initially', () => {
    renderDropdown();
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens menu on trigger click', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onSelect and closes menu on item click', () => {
    const { onSelect } = renderDropdown();
    fireEvent.click(screen.getByText('Menu'));
    fireEvent.click(screen.getByText('Edit'));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes menu on Escape', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates with arrow keys', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Menu'));
    const container = screen.getByRole('listbox').parentElement!;

    fireEvent.keyDown(container, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[0].className).toContain('bg-slate-800/80');

    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(options[1].className).toContain('bg-slate-800/80');
  });

  it('selects item with Enter key', () => {
    const { onSelect } = renderDropdown();
    fireEvent.click(screen.getByText('Menu'));
    const container = screen.getByRole('listbox').parentElement!;

    fireEvent.keyDown(container, { key: 'ArrowDown' });
    fireEvent.keyDown(container, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it('sets aria-haspopup and aria-expanded on trigger', () => {
    renderDropdown();
    const trigger = screen.getByText('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('skips disabled items during keyboard navigation', () => {
    const itemsWithDisabled: DropdownItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
      { id: 'c', label: 'C' },
    ];
    render(
      <Dropdown trigger={<button>Menu</button>} items={itemsWithDisabled} onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Menu'));
    const container = screen.getByRole('listbox').parentElement!;

    fireEvent.keyDown(container, { key: 'ArrowDown' }); // A
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // skips B, goes to C
    const options = screen.getAllByRole('option');
    expect(options[2].className).toContain('bg-slate-800/80');
  });
});
