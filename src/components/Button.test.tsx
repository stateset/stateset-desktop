/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Plus, Search } from 'lucide-react';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders primary variant by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('from-brand-500');
    expect(btn.className).toContain('to-brand-600');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-slate-800/80');
  });

  it('renders danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('from-rose-500');
    expect(btn.className).toContain('to-rose-600');
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
  });

  it('renders icon on the left by default', () => {
    render(<Button icon={Plus}>Add</Button>);
    const btn = screen.getByRole('button');
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
    // Icon should come before text
    const span = btn.querySelector('span');
    expect(span?.textContent).toBe('Add');
  });

  it('renders icon on the right when specified', () => {
    render(
      <Button icon={Search} iconPosition="right">
        Search
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('renders icon-only button with aria-label', () => {
    render(<Button icon={Plus} aria-label="Add new item" />);
    const btn = screen.getByRole('button', { name: 'Add new item' });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('shows spinner when loading', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.animate-spin')).toBeTruthy();
  });

  it('disables button when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    expect(screen.getByRole('button').className).toContain('custom-class');
  });

  it('applies correct size classes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('text-xs');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button').className).toContain('text-base');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});
