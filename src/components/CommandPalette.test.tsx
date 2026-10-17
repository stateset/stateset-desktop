/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

const navigate = vi.hoisted(() => vi.fn());
const motionPreferences = vi.hoisted(() => ({ reduced: false }));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => navigate };
});

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      onClick,
      onKeyDownCapture,
      role,
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      return (
        <div
          className={className as string}
          onClick={onClick as React.MouseEventHandler}
          onKeyDownCapture={onKeyDownCapture as React.KeyboardEventHandler<HTMLDivElement>}
          role={role as React.AriaRole}
        >
          {children}
        </div>
      );
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotionConfig: () => motionPreferences.reduced,
}));

describe('CommandPalette', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    agents: [] as Array<{ id: string; agent_type: string; status: string; name?: string | null }>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    motionPreferences.reduced = false;
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the selected chat identity when live results reorder', () => {
    const chats = [
      { id: 'a', title: 'Invoice A', status: 'idle' },
      { id: 'b', title: 'Invoice B', status: 'idle' },
    ];
    const { rerender } = render(<CommandPalette {...defaultProps} chats={chats} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Invoice' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    rerender(<CommandPalette {...defaultProps} chats={[chats[1], chats[0]]} />);
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-chat-b');
    fireEvent.change(input, { target: { value: 'Invoice ' } });
    rerender(<CommandPalette {...defaultProps} chats={chats} />);
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-chat-b');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/playground?chat=b');
    fireEvent.change(input, { target: { value: 'Invoice A' } });
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-chat-a');
  });

  it('keeps the selected agent when changing statuses resort the results', () => {
    const agents = [
      { id: 'a', name: 'Invoice A', agent_type: 'commerce', status: 'running' },
      { id: 'b', name: 'Invoice B', agent_type: 'commerce', status: 'paused' },
    ];
    const { rerender } = render(<CommandPalette {...defaultProps} agents={agents} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Invoice' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    rerender(
      <CommandPalette
        {...defaultProps}
        agents={[
          { ...agents[0], status: 'failed' },
          { ...agents[1], status: 'running' },
        ]}
      />
    );
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-agent-b');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/agent/b');
  });

  it('selects the first current result if the chosen identity disappears', () => {
    const chats = [
      { id: 'a', title: 'Invoice A', status: 'idle' },
      { id: 'b', title: 'Invoice B', status: 'idle' },
    ];
    const { rerender } = render(<CommandPalette {...defaultProps} chats={chats} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Invoice' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    rerender(
      <CommandPalette
        {...defaultProps}
        chats={[chats[0], { id: 'c', title: 'Invoice C', status: 'idle' }]}
      />
    );
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-chat-a');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/playground?chat=a');
  });

  it('does not restart scrolling when only a result status changes', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const chats = [
      { id: 'a', title: 'Invoice A', status: 'idle' },
      { id: 'b', title: 'Invoice B', status: 'idle' },
    ];
    const { rerender } = render(<CommandPalette {...defaultProps} chats={chats} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Invoice' } });
    scroll.mockClear();
    rerender(
      <CommandPalette {...defaultProps} chats={[{ ...chats[0], status: 'paused' }, chats[1]]} />
    );
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('scrolls instantly when reduced motion is requested', () => {
    motionPreferences.reduced = true;
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    render(<CommandPalette {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'instant' });
  });

  it('associates conversation status with its accessible option', () => {
    render(
      <CommandPalette
        {...defaultProps}
        chats={[{ id: 'a', title: 'Invoice A', status: 'paused', archived: true }]}
      />
    );
    expect(screen.getByRole('option', { name: 'Invoice A' })).toHaveAccessibleDescription(
      'Archived conversation · paused'
    );
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
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape on search input calls onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette {...defaultProps} onClose={onClose} />);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders agent entries when agents are provided', () => {
    const agents = [{ id: '1', agent_type: 'commerce', status: 'running', name: 'Sales Bot' }];
    render(<CommandPalette {...defaultProps} agents={agents} />);
    expect(screen.getByText('Sales Bot')).toBeInTheDocument();
  });

  it('opens a saved chat with its exact route identity and supports multiword search', () => {
    render(
      <CommandPalette
        {...defaultProps}
        chats={[
          { id: 'first', title: 'October invoices', status: 'idle' },
          { id: 'second', title: 'October report', status: 'paused', archived: true },
        ]}
      />
    );
    const input = screen.getByRole('combobox', { name: 'Search commands' });
    fireEvent.change(input, { target: { value: 'OCTOBER archived' } });
    expect(screen.queryByRole('option', { name: 'October invoices' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/playground?chat=second');
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('bounds visible chat results and can still find a chat beyond the initial window', () => {
    render(
      <CommandPalette
        {...defaultProps}
        chats={Array.from({ length: 45 }, (_, i) => ({
          id: String(i),
          title: `Project ${i}`,
          status: 'idle',
        }))}
      />
    );
    expect(
      screen.getAllByRole('option').filter((item) => item.textContent?.includes('Project'))
    ).toHaveLength(30);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Project 44' } });
    expect(screen.getByRole('option', { name: 'Project 44' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/playground?chat=44');
  });

  it('keeps keyboard selection aligned across conversation and agent groups', () => {
    render(
      <CommandPalette
        {...defaultProps}
        chats={[
          { id: 'a', title: 'Invoice A', status: 'idle' },
          { id: 'b', title: 'Invoice B', status: 'idle' },
        ]}
        agents={[{ id: 'agent', name: 'Invoice agent', agent_type: 'commerce', status: 'running' }]}
      />
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Invoice' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'command-option-chat-b');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/playground?chat=b');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/agent/agent');
  });

  it('ignores composition Enter and does not execute the selected command from the close button', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close command palette' }), {
      key: 'Enter',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('traps Tab in the palette and restores focus to its trigger on close', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open palette</button>
          <CommandPalette isOpen={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open palette' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close command palette' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });
});
