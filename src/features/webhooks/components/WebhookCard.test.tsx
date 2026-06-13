/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookCard } from './WebhookCard';
import type { Webhook } from '../../../types';

function makeWebhook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: 'wh-1',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    name: 'Order Events',
    url: 'https://example.com/hooks/orders',
    direction: 'outgoing',
    events: ['order.created', 'order.updated'],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof WebhookCard>[0]> = {}) {
  return {
    webhook: makeWebhook(),
    onTest: vi.fn(),
    onToggleStatus: vi.fn(),
    onDelete: vi.fn(),
    onViewDetails: vi.fn(),
    isTesting: false,
    ...overrides,
  };
}

describe('WebhookCard', () => {
  it('renders name, url and status', () => {
    render(<WebhookCard {...makeProps()} />);
    expect(screen.getByText('Order Events')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/hooks/orders')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders at most three event chips plus an overflow indicator', () => {
    render(
      <WebhookCard
        {...makeProps({
          webhook: makeWebhook({ events: ['a.one', 'b.two', 'c.three', 'd.four', 'e.five'] }),
        })}
      />
    );

    expect(screen.getByText('a.one')).toBeInTheDocument();
    expect(screen.getByText('b.two')).toBeInTheDocument();
    expect(screen.getByText('c.three')).toBeInTheDocument();
    expect(screen.queryByText('d.four')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('does not render an overflow indicator for three or fewer events', () => {
    render(<WebhookCard {...makeProps()} />);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('invokes action callbacks', () => {
    const props = makeProps();
    render(<WebhookCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Test webhook' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause webhook' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete webhook' }));
    fireEvent.click(screen.getByRole('button', { name: 'View webhook deliveries' }));

    expect(props.onTest).toHaveBeenCalledTimes(1);
    expect(props.onToggleStatus).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onViewDetails).toHaveBeenCalledTimes(1);
  });

  it('disables the test button while testing', () => {
    render(<WebhookCard {...makeProps({ isTesting: true })} />);
    expect(screen.getByRole('button', { name: 'Test webhook' })).toBeDisabled();
  });

  it('disables the test button when the webhook is not active', () => {
    render(<WebhookCard {...makeProps({ webhook: makeWebhook({ status: 'paused' }) })} />);
    expect(screen.getByRole('button', { name: 'Test webhook' })).toBeDisabled();
  });

  it('shows an activate toggle for paused webhooks', () => {
    render(<WebhookCard {...makeProps({ webhook: makeWebhook({ status: 'paused' }) })} />);
    expect(screen.getByRole('button', { name: 'Activate webhook' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause webhook' })).not.toBeInTheDocument();
  });

  it('renders the last triggered timestamp when present', () => {
    render(
      <WebhookCard
        {...makeProps({
          webhook: makeWebhook({ last_triggered_at: '2026-03-04T05:06:07Z' }),
        })}
      />
    );
    expect(screen.getByText(/Last triggered:/)).toBeInTheDocument();
  });

  it('omits the last triggered line when never triggered', () => {
    render(<WebhookCard {...makeProps()} />);
    expect(screen.queryByText(/Last triggered:/)).not.toBeInTheDocument();
  });
});
