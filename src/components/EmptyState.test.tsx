/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { Inbox } from 'lucide-react';

describe('EmptyState', () => {
  it('renders icon and title', () => {
    render(<EmptyState icon={Inbox} title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    // The Lucide icon renders an SVG element
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState icon={Inbox} title="No items" description="Try creating one" />);
    expect(screen.getByText('Try creating one')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState icon={Inbox} title="No items" />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders action button and calls onClick', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        icon={Inbox}
        title="No items"
        action={{ label: 'Create', onClick: handleClick }}
      />
    );
    const button = screen.getByRole('button', { name: 'Create' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when not provided', () => {
    render(<EmptyState icon={Inbox} title="No items" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="No items" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
