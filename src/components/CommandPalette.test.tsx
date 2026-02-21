/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, onClick }: React.PropsWithChildren<Record<string, unknown>>) => {
      return (
        <div className={className as string} onClick={onClick as React.MouseEventHandler}>
          {children}
        </div>
      );
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}));

describe('CommandPalette', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    agents: [] as Array<{ id: string; agent_type: string; status: string; name?: string | null }>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when not open', () => {
    render(<CommandPalette {...defaultProps} isOpen={false} />);
    // createPortal renders to body but CommandPalette returns null when closed
    expect(screen.queryByPlaceholderText('Search commands...')).not.toBeInTheDocument();
  });

  it('renders command list when open', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search commands...')).toBeInTheDocument();
    // Should show navigation commands
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    expect(screen.getByText('Go to Analytics')).toBeInTheDocument();
  });

  it('filters commands by search query', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'Dashboard' } });

    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Go to Settings')).not.toBeInTheDocument();
  });

  it('shows "No commands found" when query matches nothing', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'xyznonexistent' } });
    expect(screen.getByText(/No commands found/)).toBeInTheDocument();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders agent entries when agents are provided', () => {
    const agents = [{ id: '1', agent_type: 'commerce', status: 'running', name: 'Sales Bot' }];
    render(<CommandPalette {...defaultProps} agents={agents} />);
    expect(screen.getByText('Sales Bot')).toBeInTheDocument();
  });
});
