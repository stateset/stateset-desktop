/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Onboarding from './Onboarding';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>): JSX.Element => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, className, ...rest } = props;
  return { className: className as string, ...rest };
}

describe('Onboarding', () => {
  it('renders the first step inside a modal dialog', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'StateSet onboarding' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByRole('heading', { name: 'AI-Powered Customer Service' })
    ).toBeInTheDocument();
  });

  it('exposes progress through a progressbar', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    const progress = screen.getByRole('progressbar', { name: 'Onboarding progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
  });

  it('advances to the next step and updates progress', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to next step' }));

    expect(screen.getByRole('heading', { name: 'One-Click Integrations' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('disables the back button on the first step', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous step not available' })).toBeDisabled();
  });

  it('goes back to the previous step', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous step' }));

    expect(
      screen.getByRole('heading', { name: 'AI-Powered Customer Service' })
    ).toBeInTheDocument();
  });

  it('jumps to a step via the step indicator dots', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 4' }));

    expect(screen.getByRole('heading', { name: 'Always On, Always Working' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to step 4' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('calls onComplete when skipping', () => {
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('shows Get Started on the last step and calls onComplete', () => {
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 4' }));

    const finishButton = screen.getByRole('button', {
      name: 'Finish onboarding and get started',
    });
    expect(finishButton).toHaveTextContent('Get Started');
    fireEvent.click(finishButton);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
