/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WebhookForm } from './WebhookForm';

function makeProps(overrides: Partial<Parameters<typeof WebhookForm>[0]> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    ...overrides,
  };
}

describe('WebhookForm', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<WebhookForm {...makeProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders create mode title and button when no initial value', () => {
    render(<WebhookForm {...makeProps()} />);
    expect(screen.getByText('Create Webhook')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create webhook' })).toBeInTheDocument();
  });

  it('renders edit mode with initial values prefilled', () => {
    render(
      <WebhookForm
        {...makeProps({
          initial: {
            name: 'Order Hook',
            url: 'https://example.com/hook',
            events: ['order.created'],
            direction: 'incoming',
          },
        })}
      />
    );

    expect(screen.getByText('Edit Webhook')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Order Hook');
    expect(screen.getByLabelText('URL')).toHaveValue('https://example.com/hook');
    expect(screen.getByRole('radio', { name: 'Incoming' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Update webhook' })).toBeInTheDocument();
  });

  it('defaults direction to outgoing', () => {
    render(<WebhookForm {...makeProps()} />);
    expect(screen.getByRole('radio', { name: 'Outgoing' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Incoming' })).not.toBeChecked();
  });

  it('shows a URL validation error for non-http URLs', () => {
    render(<WebhookForm {...makeProps()} />);
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(urlInput, { target: { value: 'ftp://example.com' } });
    expect(screen.getByText('URL must start with http:// or https://')).toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    expect(screen.queryByText('URL must start with http:// or https://')).not.toBeInTheDocument();
  });

  it('does not show URL error when the field is untouched', () => {
    render(<WebhookForm {...makeProps()} />);
    expect(screen.queryByText('URL must start with http:// or https://')).not.toBeInTheDocument();
  });

  it('disables submit until name, url and at least one event are provided', () => {
    render(<WebhookForm {...makeProps()} />);
    const submit = screen.getByRole('button', { name: 'Create webhook' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Hook' } });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com/hook' },
    });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByText('Agent Started'));
    expect(submit).toBeEnabled();
  });

  it('submits the entered data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WebhookForm {...makeProps({ onSubmit })} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Hook' } });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com/hook' },
    });
    fireEvent.click(screen.getByText('Agent Started'));
    fireEvent.click(screen.getByRole('radio', { name: 'Incoming' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create webhook' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'My Hook',
        url: 'https://example.com/hook',
        events: ['agent.started'],
        direction: 'incoming',
      })
    );
  });

  it('calls onClose from the close icon and the cancel button', () => {
    const onClose = vi.fn();
    render(<WebhookForm {...makeProps({ onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close webhook form' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows saving state and disables submit while loading', () => {
    render(
      <WebhookForm
        {...makeProps({
          isLoading: true,
          initial: {
            name: 'Order Hook',
            url: 'https://example.com/hook',
            events: ['order.created'],
            direction: 'outgoing',
          },
        })}
      />
    );

    const submit = screen.getByRole('button', { name: 'Update webhook' });
    expect(submit).toHaveTextContent('Saving...');
    expect(submit).toBeDisabled();
  });
});
