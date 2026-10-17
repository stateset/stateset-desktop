/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookDetailPanel } from './WebhookDetailPanel';
import type { Webhook, WebhookDelivery } from '../../../types';

const mockUseWebhookDeliveries = vi.fn();

vi.mock('../hooks/useWebhooks', () => ({
  useWebhookDeliveries: (webhookId: string | null) => mockUseWebhookDeliveries(webhookId),
}));

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

function makeDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: 'del-1',
    webhook_id: 'wh-1',
    event: 'order.created',
    status_code: 200,
    request_body: '{"order_id":"o-1"}',
    response_body: '{"ok":true}',
    duration_ms: 42,
    success: true,
    created_at: '2026-02-01T10:00:00Z',
    ...overrides,
  };
}

function setDeliveries(
  deliveries: WebhookDelivery[] | undefined,
  { isLoading = false, refetch = vi.fn() } = {}
) {
  mockUseWebhookDeliveries.mockReturnValue({ data: deliveries, isLoading, refetch });
  return refetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WebhookDetailPanel', () => {
  it('renders webhook metadata in the header', () => {
    setDeliveries([]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);

    expect(screen.getByText('Order Events')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/hooks/orders')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('outgoing')).toBeInTheDocument();
    expect(screen.getByText('order.created')).toBeInTheDocument();
    expect(screen.getByText('order.updated')).toBeInTheDocument();
  });

  it('queries deliveries for the webhook id', () => {
    setDeliveries([]);
    render(<WebhookDetailPanel webhook={makeWebhook({ id: 'wh-42' })} onClose={vi.fn()} />);
    expect(mockUseWebhookDeliveries).toHaveBeenCalledWith('wh-42');
  });

  it('shows the empty state when there are no deliveries', () => {
    setDeliveries([]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument();
  });

  it('does not show the empty state while loading', () => {
    setDeliveries(undefined, { isLoading: true });
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);
    expect(screen.queryByText('No deliveries yet')).not.toBeInTheDocument();
  });

  it('renders delivery rows with status code and duration', () => {
    setDeliveries([
      makeDelivery(),
      makeDelivery({ id: 'del-2', event: 'order.failed', success: false, status_code: 500 }),
    ]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);

    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getAllByText('42ms')).toHaveLength(2);
    expect(screen.getByText('order.failed')).toBeInTheDocument();
  });

  it('omits the status code badge when status_code is null', () => {
    setDeliveries([makeDelivery({ status_code: null })]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });

  it('expands a delivery to show formatted request and response bodies', () => {
    setDeliveries([makeDelivery()]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);

    const toggle = screen.getByRole('button', {
      name: 'Expand delivery details for order.created',
    });
    fireEvent.click(toggle);

    expect(screen.getByText('Request Body')).toBeInTheDocument();
    expect(screen.getByText('Response Body')).toBeInTheDocument();
    // JSON is pretty-printed
    expect(screen.getByText(/"order_id": "o-1"/)).toBeInTheDocument();
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();

    // Collapse again
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse delivery details for order.created' })
    );
    expect(screen.queryByText('Request Body')).not.toBeInTheDocument();
  });

  it('renders the raw body when it is not valid JSON', () => {
    setDeliveries([makeDelivery({ request_body: 'not-json', response_body: undefined })]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand delivery details for order.created' })
    );

    expect(screen.getByText('not-json')).toBeInTheDocument();
    expect(screen.queryByText('Response Body')).not.toBeInTheDocument();
  });

  it('refetches deliveries from the refresh button', () => {
    const refetch = setDeliveries([]);
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh deliveries' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('calls onClose from the close button', () => {
    setDeliveries([]);
    const onClose = vi.fn();
    render(<WebhookDetailPanel webhook={makeWebhook()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close webhook details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
