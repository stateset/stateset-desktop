/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import { useAuthStore } from '../../../stores/auth';
import { useDurableWorkflowsStore } from '../../../stores/durableWorkflows';
import { DurableWorkflowSettings } from './DurableWorkflowSettings';

const healthMock = vi.fn();
const initializeMock = vi.fn();
const setConfigurationMock = vi.fn();
const clearApiKeyMock = vi.fn();

vi.mock('../../../lib/durableWorkflows', () => ({
  durableWorkflowApi: {
    health: (...args: unknown[]) => healthMock(...args),
  },
}));

function seedStore(overrides: Record<string, unknown> = {}) {
  useAuthStore.setState({
    tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', tier: 'pro', created_at: '' },
  } as never);
  useDurableWorkflowsStore.setState({
    initialized: true,
    engineUrl: 'https://engine.example.com',
    apiKey: null,
    initialize: initializeMock,
    setConfiguration: setConfigurationMock,
    clearApiKey: clearApiKeyMock,
    ...overrides,
  } as never);
}

describe('DurableWorkflowSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthMock.mockResolvedValue({ ok: true });
    setConfigurationMock.mockResolvedValue(undefined);
    clearApiKeyMock.mockResolvedValue(undefined);
    seedStore();
  });

  it('renders the engine section with the configured URL', () => {
    renderWithProviders(<DurableWorkflowSettings />);

    expect(screen.getByText('Durable Workflow Engine')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://engine.example.com')).toBeInTheDocument();
    expect(screen.getByText('No key stored.')).toBeInTheDocument();
  });

  it('initializes the store on mount', () => {
    renderWithProviders(<DurableWorkflowSettings />);

    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps save disabled until a key is entered when none is stored', () => {
    renderWithProviders(<DurableWorkflowSettings />);

    const save = screen.getByRole('button', { name: 'Save configuration' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Required'), {
      target: { value: 'new-key' },
    });
    expect(save).not.toBeDisabled();
  });

  it('saves configuration and clears the key input', async () => {
    renderWithProviders(<DurableWorkflowSettings />);

    fireEvent.change(screen.getByPlaceholderText('Required'), {
      target: { value: 'new-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() =>
      expect(setConfigurationMock).toHaveBeenCalledWith('https://engine.example.com', 'new-key')
    );
    expect(screen.getByText('Durable workflow configuration saved.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('Required')).toHaveValue(''));
  });

  it('shows an error when saving fails', async () => {
    setConfigurationMock.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<DurableWorkflowSettings />);

    fireEvent.change(screen.getByPlaceholderText('Required'), {
      target: { value: 'new-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument());
  });

  it('tests the connection when a key and tenant exist', async () => {
    seedStore({ apiKey: 'stored-key' });
    renderWithProviders(<DurableWorkflowSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => expect(healthMock).toHaveBeenCalledWith('tenant-1'));
    expect(screen.getByText('Durable workflow engine is reachable.')).toBeInTheDocument();
  });

  it('shows an error when the connection test fails', async () => {
    seedStore({ apiKey: 'stored-key' });
    healthMock.mockRejectedValueOnce(new Error('timeout'));
    renderWithProviders(<DurableWorkflowSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => expect(screen.getByText('timeout')).toBeInTheDocument());
  });

  it('removes the stored key', async () => {
    seedStore({ apiKey: 'stored-key' });
    renderWithProviders(<DurableWorkflowSettings />);

    expect(
      screen.getByText('A key is stored in the operating system credential store.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(clearApiKeyMock).toHaveBeenCalledTimes(1));
  });
});
