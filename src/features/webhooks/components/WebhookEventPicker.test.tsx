/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookEventPicker } from './WebhookEventPicker';

describe('WebhookEventPicker', () => {
  it('renders all event groups', () => {
    render(<WebhookEventPicker selected={[]} onChange={() => {}} />);
    expect(screen.getByText('Agent')).toBeDefined();
    expect(screen.getByText('Session')).toBeDefined();
    expect(screen.getByText('Commerce')).toBeDefined();
    expect(screen.getByText('Support')).toBeDefined();
  });

  it('renders all 11 individual events', () => {
    render(<WebhookEventPicker selected={[]} onChange={() => {}} />);
    const labels = [
      'Agent Started',
      'Agent Stopped',
      'Agent Failed',
      'Agent Message',
      'Tool Call',
      'Session Created',
      'Session Deleted',
      'Order Created',
      'Order Updated',
      'Ticket Created',
      'Ticket Resolved',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('calls onChange with event added when clicking unselected event', () => {
    const onChange = vi.fn();
    render(<WebhookEventPicker selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Agent Started'));
    expect(onChange).toHaveBeenCalledWith(['agent.started']);
  });

  it('calls onChange with event removed when clicking selected event', () => {
    const onChange = vi.fn();
    render(
      <WebhookEventPicker selected={['agent.started', 'agent.stopped']} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('Agent Started'));
    expect(onChange).toHaveBeenCalledWith(['agent.stopped']);
  });

  it('toggles all events in group when clicking group header', () => {
    const onChange = vi.fn();
    render(<WebhookEventPicker selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Session'));
    expect(onChange).toHaveBeenCalledWith(['session.created', 'session.deleted']);
  });

  it('deselects all in group when all are selected', () => {
    const onChange = vi.fn();
    render(
      <WebhookEventPicker selected={['session.created', 'session.deleted']} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('Session'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('adds missing group events without removing others', () => {
    const onChange = vi.fn();
    render(
      <WebhookEventPicker selected={['agent.started', 'session.created']} onChange={onChange} />
    );
    // Click "Session" group - session.created already selected, session.deleted not
    fireEvent.click(screen.getByText('Session'));
    const result = onChange.mock.calls[0][0] as string[];
    expect(result).toContain('agent.started');
    expect(result).toContain('session.created');
    expect(result).toContain('session.deleted');
  });
});
