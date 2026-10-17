/** @vitest-environment happy-dom */
import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import { useAuthStore } from '../../../stores/auth';
import { useDurableWorkflowsStore } from '../../../stores/durableWorkflows';
import { DurableWorkflowSettings } from './DurableWorkflowSettings';

const healthMock = vi.fn();
const initializeMock = vi.fn();
const setConfigurationMock = vi.fn();
const clearApiKeyMock = vi.fn();
const secureStorageMock = vi.fn();
vi.mock('../../../hooks/useSecureStorageAvailability', () => ({
  useSecureStorageAvailability: () => secureStorageMock(),
}));

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
    secureStorageMock.mockReturnValue(null);
    healthMock.mockResolvedValue({ ok: true });
    setConfigurationMock.mockReset().mockResolvedValue(undefined);
    initializeMock.mockReset().mockResolvedValue(undefined);
    clearApiKeyMock.mockResolvedValue(undefined);
    seedStore();
  });

  it.each([false, true])(
    'blocks fallback actions and preserves connection drafts during recovery (%s)',
    (edited) => {
      seedStore({
        initialized: false,
        initializationError: 'Saved settings could not be loaded.',
        apiKey: 'stale-key',
      });
      renderWithProviders(<DurableWorkflowSettings />);
      const input = screen.getByRole('textbox', { name: 'Engine URL' });
      if (edited) fireEvent.change(input, { target: { value: 'https://draft-engine.example' } });
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove key' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Retry loading settings' })).toBeVisible();
      act(() =>
        useDurableWorkflowsStore.setState({
          initialized: true,
          initializationError: null,
          engineUrl: 'https://restored-engine.example',
        })
      );
      expect(input).toHaveValue(
        edited ? 'https://draft-engine.example' : 'https://restored-engine.example'
      );
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
      expect(healthMock).not.toHaveBeenCalled();
      expect(setConfigurationMock).not.toHaveBeenCalled();
    }
  );

  it.each([null, 'Saved settings could not be loaded.'])(
    'keeps connection and key status unknown until settings load (%s)',
    (initializationError) => {
      seedStore({
        initialized: false,
        initializationError,
        engineUrl: 'https://fallback.example',
        apiKey: null,
      });
      renderWithProviders(<DurableWorkflowSettings />);
      const url = screen.getByRole('textbox', { name: 'Engine URL' });
      const key = screen.getByPlaceholderText('Key status unavailable');
      expect(url).toHaveValue('');
      expect(url).toHaveAttribute('placeholder', 'Saved connection not loaded');
      expect(screen.getByText('Key status unavailable until settings load.')).toBeVisible();
      expect(screen.queryByText('No key configured.')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Required')).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue('https://fallback.example')).not.toBeInTheDocument();
      fireEvent.change(key, { target: { value: 'retained-key-draft' } });
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
      act(() =>
        useDurableWorkflowsStore.setState({
          initialized: true,
          initializationError: null,
          engineUrl: 'https://restored.example',
          apiKey: null,
        })
      );
      expect(url).toHaveValue('https://restored.example');
      expect(key).toHaveValue('retained-key-draft');
      expect(key).toHaveAttribute('placeholder', 'Required');
      expect(screen.getByText('No key configured.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
    }
  );

  it('renders the engine section with the configured URL', () => {
    renderWithProviders(<DurableWorkflowSettings />);

    expect(screen.getByText('Durable Workflow Engine')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://engine.example.com')).toBeInTheDocument();
    expect(screen.getByText('No key configured.')).toBeInTheDocument();
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

  it.each([false, true])(
    'preserves newer connection drafts when an earlier save finishes (failed=%s)',
    async (failed) => {
      let finish!: () => void;
      setConfigurationMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            finish = () => (failed ? reject(new Error('Older save failed')) : resolve());
          })
      );
      seedStore({ apiKey: 'saved-key' });
      renderWithProviders(<DurableWorkflowSettings />);
      const url = screen.getByRole('textbox', { name: 'Engine URL' });
      const key = screen.getByLabelText(/^API key/);
      fireEvent.change(url, { target: { value: 'https://submitted.example' } });
      fireEvent.change(key, { target: { value: 'submitted-key' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
      await waitFor(() => expect(setConfigurationMock).toHaveBeenCalledOnce());
      fireEvent.change(url, { target: { value: 'https://newer-draft.example' } });
      fireEvent.change(key, { target: { value: 'newer-draft-key' } });
      await act(async () => finish());
      expect(url).toHaveValue('https://newer-draft.example');
      expect(key).toHaveValue('newer-draft-key');
      expect(screen.queryByText('Durable workflow configuration saved.')).not.toBeInTheDocument();
      expect(screen.queryByText('Older save failed')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
      await waitFor(() =>
        expect(setConfigurationMock).toHaveBeenLastCalledWith(
          'https://newer-draft.example',
          'newer-draft-key'
        )
      );
      await screen.findByText('Durable workflow configuration saved.');
      expect(key).toHaveValue('');
    }
  );

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
      screen.getByText(/Credential storage availability could not be confirmed/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(clearApiKeyMock).toHaveBeenCalledTimes(1));
  });
  it('explains when a configured key lasts only for the app session', () => {
    secureStorageMock.mockReturnValue(false);
    seedStore({ apiKey: 'session-key' });
    renderWithProviders(<DurableWorkflowSettings />);
    expect(screen.getByText(/Enter it again after restarting/)).toBeInTheDocument();
  });
  it('confirms operating system encryption only when available', () => {
    secureStorageMock.mockReturnValue(true);
    seedStore({ apiKey: 'stored-key' });
    renderWithProviders(<DurableWorkflowSettings />);
    expect(screen.getByText(/encrypted using operating system secure storage/)).toBeInTheDocument();
  });
});
