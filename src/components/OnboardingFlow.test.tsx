/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingFlow, FeatureHighlight } from './OnboardingFlow';

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

describe('OnboardingFlow', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<OnboardingFlow isOpen={false} onComplete={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a dialog labelled by the current step title', () => {
    render(<OnboardingFlow isOpen onComplete={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Welcome to StateSet' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('exposes progress through a progressbar', () => {
    render(<OnboardingFlow isOpen onComplete={vi.fn()} />);
    const progress = screen.getByRole('progressbar', { name: 'Onboarding progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
  });

  it('advances through steps with the Next button', () => {
    render(<OnboardingFlow isOpen onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByRole('heading', { name: 'Create AI Agents' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('renders the tips for the current step', () => {
    render(<OnboardingFlow isOpen onComplete={vi.fn()} />);
    expect(
      screen.getByText('StateSet agents can handle customer inquiries 24/7')
    ).toBeInTheDocument();
  });

  it('jumps to a step via the indicator dots', () => {
    render(<OnboardingFlow isOpen onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 5' }));

    expect(screen.getByRole('heading', { name: "You're Ready!" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to step 5' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('calls onComplete when skipping the tour', () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow isOpen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding tour' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('calls onComplete from Get Started on the last step', () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow isOpen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 5' }));
    fireEvent.click(screen.getByRole('button', { name: /Get Started/ }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe('FeatureHighlight', () => {
  it('renders only children when not visible', () => {
    render(
      <FeatureHighlight isVisible={false} onDismiss={vi.fn()} title="New!" description="Try it">
        <button type="button">Target</button>
      </FeatureHighlight>
    );
    expect(screen.getByRole('button', { name: 'Target' })).toBeInTheDocument();
    expect(screen.queryByText('New!')).not.toBeInTheDocument();
  });

  it('renders the highlight tooltip when visible', () => {
    render(
      <FeatureHighlight isVisible onDismiss={vi.fn()} title="New!" description="Try it">
        <button type="button">Target</button>
      </FeatureHighlight>
    );
    expect(screen.getByText('New!')).toBeInTheDocument();
    expect(screen.getByText('Try it')).toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <FeatureHighlight isVisible onDismiss={onDismiss} title="New!" description="Try it">
        <button type="button">Target</button>
      </FeatureHighlight>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss feature highlight' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
