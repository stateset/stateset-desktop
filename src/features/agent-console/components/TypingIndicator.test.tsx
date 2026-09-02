/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  it('renders a polite live status', () => {
    render(<TypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the thinking label', () => {
    render(<TypingIndicator />);
    expect(screen.getByText('Agent is thinking')).toBeInTheDocument();
  });
});
