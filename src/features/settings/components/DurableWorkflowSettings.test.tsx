/** @vitest-environment happy-dom */
import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import { useAuthStore } from '../../../stores/auth';
import * as workflowStore from '../../../stores/durableWorkflows';
import { DurableWorkflowSettings } from './DurableWorkflowSettings';

const healthMock = vi.fn();
const initializeMock = vi.fn();
const setConfigurationMock = vi.fn();
const clearApiKeyMock = vi.fn();
const secureStorageMock = vi.fn();
const useDurableWorkflowsStore = workflowStore.useDurableWorkflowsStore;
let connectionGeneration = 0;
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
    initializationError: null,
    configuring: false,
    connectionRevision: 'connection-1',
    engineUrl: 'https://engine.example.com',
    apiKey: null,
    initialize: initializeMock,
    setConfiguration: setConfigurationMock,
    clearApiKey: clearApiKeyMock,
    ...overrides,
  } as never);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function changeSavedConnection(values: Record<string, unknown>) {
  connectionGeneration++;
  useDurableWorkflowsStore.setState({ configuring: true });
  useDurableWorkflowsStore.setState({
    connectionRevision: `connection-${connectionGeneration + 1}`,
    ...values,
  });
  useDurableWorkflowsStore.setState({ configuring: false });
}

describe('DurableWorkflowSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    connectionGeneration = 0;
    vi.spyOn(workflowStore, 'getWorkflowConnectionGeneration').mockImplementation(
      () => connectionGeneration
    );
    secureStorageMock.mockReturnValue(null);
    healthMock.mockReset().mockResolvedValue({ ok: true });
    setConfigurationMock.mockReset().mockImplementation(async (url: string, key?: string) => {
      changeSavedConnection({
        engineUrl: url.trim().replace(/\/+$/, ''),
        apiKey: key?.trim() || useDurableWorkflowsStore.getState().apiKey,
      });
    });
    initializeMock.mockReset().mockResolvedValue(undefined);
    clearApiKeyMock.mockReset().mockImplementation(async () => {
      changeSavedConnection({ apiKey: null });
    });
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
      expect(screen.getByLabelText('API key', { exact: true })).toBe(key);
      expect(key).toHaveAccessibleDescription('Key status unavailable until settings load.');
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
      expect(key).toHaveAccessibleName('API key');
      expect(key).toHaveAccessibleDescription('No key configured.');
      expect(screen.getByText('No key configured.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
    }
  );

  it('renders the engine section with the configured URL', () => {
    renderWithProviders(<DurableWorkflowSettings />);

    expect(screen.getByText('Durable Workflow Engine')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://engine.example.com')).toBeInTheDocument();
    expect(screen.getByText('No key configured.')).toBeInTheDocument();
    expect(screen.getByLabelText('API key', { exact: true })).toHaveAccessibleDescription(
      'No key configured.'
    );
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
    await waitFor(() => expect(screen.getByLabelText(/^API key/)).toHaveValue(''));
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
    expect(screen.getByLabelText('API key', { exact: true })).toHaveAccessibleDescription(
      'The key is available for this app session. Enter it again after restarting.'
    );
  });
  it('confirms operating system encryption only when available', () => {
    secureStorageMock.mockReturnValue(true);
    seedStore({ apiKey: 'stored-key' });
    renderWithProviders(<DurableWorkflowSettings />);
    expect(screen.getByText(/encrypted using operating system secure storage/)).toBeInTheDocument();
    expect(screen.getByLabelText('API key', { exact: true })).toHaveAccessibleDescription(
      'The key is encrypted using operating system secure storage.'
    );
  });

  it.each(['URL', 'key'] as const)(
    'tests only saved settings when the %s draft is dirty',
    async (field) => {
      seedStore({ apiKey: 'stored-key' });
      renderWithProviders(<DurableWorkflowSettings />);
      const input =
        field === 'URL'
          ? screen.getByRole('textbox', { name: 'Engine URL' })
          : screen.getByLabelText(/^API key/);
      fireEvent.change(input, {
        target: { value: field === 'URL' ? 'https://draft.example' : 'draft-key' },
      });
      const test = screen.getByRole('button', { name: 'Test connection' });
      expect(test).toBeDisabled();
      expect(test).toHaveAccessibleDescription('Save changes before testing.');
      fireEvent.click(test);
      expect(healthMock).not.toHaveBeenCalled();
      expect(setConfigurationMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
      expect(await screen.findByRole('status')).toHaveTextContent('configuration saved');
      expect(test).toBeEnabled();
      expect(screen.queryByText('Save changes before testing.')).not.toBeInTheDocument();
      fireEvent.click(test);
      await waitFor(() => expect(healthMock).toHaveBeenCalledOnce());
    }
  );

  it.each([
    ['URL', false],
    ['URL', true],
    ['key', false],
    ['key', true],
  ] as const)('ignores deferred health after a %s edit (failed=%s)', async (field, failed) => {
    seedStore({ apiKey: 'stored-key' });
    const pending = deferred();
    healthMock.mockReturnValueOnce(pending.promise);
    renderWithProviders(<DurableWorkflowSettings />);
    const test = screen.getByRole('button', { name: 'Test connection' });
    fireEvent.click(test);
    expect(test).toHaveAttribute('aria-busy', 'true');
    const input =
      field === 'URL'
        ? screen.getByRole('textbox', { name: 'Engine URL' })
        : screen.getByLabelText(/^API key/);
    fireEvent.change(input, {
      target: { value: field === 'URL' ? 'https://draft.example' : 'draft-key' },
    });
    expect(test).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
    await act(async () =>
      failed ? pending.reject(new Error('Old health failure')) : pending.resolve()
    );
    expect(screen.queryByText('Durable workflow engine is reachable.')).not.toBeInTheDocument();
    expect(screen.queryByText('Old health failure')).not.toBeInTheDocument();
    expect(input).toHaveValue(field === 'URL' ? 'https://draft.example' : 'draft-key');
    expect(setConfigurationMock).not.toHaveBeenCalled();
  });

  it.each([
    ['URL', false],
    ['URL', true],
    ['key', false],
    ['key', true],
    ['revision', false],
    ['revision', true],
    ['initialization', false],
    ['initialization', true],
    ['tenant', false],
    ['tenant', true],
    ['generation', false],
    ['generation', true],
  ] as const)(
    'releases stale health after a saved %s change (failed=%s)',
    async (field, failed) => {
      seedStore({ apiKey: 'stored-key' });
      const pending = deferred();
      healthMock.mockReturnValueOnce(pending.promise);
      renderWithProviders(<DurableWorkflowSettings />);
      const test = screen.getByRole('button', { name: 'Test connection' });
      fireEvent.click(test);
      act(() => {
        if (field === 'tenant')
          useAuthStore.setState((state) => ({ tenant: { ...state.tenant!, id: 'tenant-2' } }));
        else if (field === 'generation') {
          // Same final URL/key/revision: the generation still invalidates this request.
          connectionGeneration++;
          useDurableWorkflowsStore.setState({ configuring: true });
          useDurableWorkflowsStore.setState({ configuring: false });
        } else {
          const changes = {
            URL: { engineUrl: 'https://other.example' },
            key: { apiKey: 'replacement-key' },
            revision: { connectionRevision: 'replacement-revision' },
            initialization: { initialized: false },
          };
          useDurableWorkflowsStore.setState(changes[field]);
        }
      });
      expect(test).toHaveAttribute('aria-busy', 'false');
      if (field === 'initialization') {
        expect(test).toBeDisabled();
        act(() => useDurableWorkflowsStore.setState({ initialized: true }));
      }
      expect(test).toBeEnabled();
      await act(async () =>
        failed ? pending.reject(new Error('Stale health failure')) : pending.resolve()
      );
      expect(screen.queryByText('Durable workflow engine is reachable.')).not.toBeInTheDocument();
      expect(screen.queryByText('Stale health failure')).not.toBeInTheDocument();
      fireEvent.click(test);
      expect(await screen.findByRole('status')).toHaveTextContent('engine is reachable');
      expect(healthMock).toHaveBeenLastCalledWith(field === 'tenant' ? 'tenant-2' : 'tenant-1');
    }
  );

  it.each([false, true])(
    'does not unlock or overwrite a newer check when the old one settles (failed=%s)',
    async (failed) => {
      seedStore({ apiKey: 'stored-key' });
      const older = deferred();
      const newer = deferred();
      healthMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      renderWithProviders(<DurableWorkflowSettings />);
      const test = screen.getByRole('button', { name: 'Test connection' });
      fireEvent.click(test);
      act(() => useDurableWorkflowsStore.setState({ connectionRevision: 'new-revision' }));
      expect(test).toBeEnabled();
      fireEvent.click(test);
      expect(healthMock).toHaveBeenCalledTimes(2);
      await act(async () => (failed ? older.reject(new Error('Older failure')) : older.resolve()));
      expect(test).toBeDisabled();
      expect(test).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText('Durable workflow engine is reachable.')).not.toBeInTheDocument();
      expect(screen.queryByText('Older failure')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove key' })).toBeDisabled();
      await act(async () => newer.resolve());
      expect(await screen.findByRole('status')).toHaveTextContent('engine is reachable');
      expect(test).toBeEnabled();
    }
  );

  it.each([false, true])('ignores a check settling after unmount (failed=%s)', async (failed) => {
    seedStore({ apiKey: 'stored-key' });
    const older = deferred();
    const newer = deferred();
    healthMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { unmount } = renderWithProviders(<DurableWorkflowSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    unmount();
    renderWithProviders(<DurableWorkflowSettings />);
    const test = screen.getByRole('button', { name: 'Test connection' });
    fireEvent.click(test);
    await act(async () =>
      failed ? older.reject(new Error('Unmounted failure')) : older.resolve()
    );
    expect(test).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Unmounted failure')).not.toBeInTheDocument();
    expect(screen.queryByText('Durable workflow engine is reachable.')).not.toBeInTheDocument();
    await act(async () => newer.resolve());
    expect(await screen.findByRole('status')).toHaveTextContent('engine is reachable');
  });

  it('retains the key after a failed removal, guards pending actions, and permits retry', async () => {
    seedStore({ apiKey: 'stored-key' });
    const pending = deferred();
    clearApiKeyMock.mockReturnValueOnce(pending.promise);
    renderWithProviders(<DurableWorkflowSettings />);
    const remove = screen.getByRole('button', { name: 'Remove key' });
    fireEvent.click(remove);
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(remove).toHaveAttribute('aria-busy', 'true');
    expect(remove).toHaveTextContent('Removing…');
    expect(remove).toBeDisabled();
    expect(clearApiKeyMock).toHaveBeenCalledOnce();
    expect(setConfigurationMock).not.toHaveBeenCalled();
    expect(healthMock).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error('Credential storage is unavailable.')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to remove API key. Credential storage is unavailable.'
    );
    expect(useDurableWorkflowsStore.getState().apiKey).toBe('stored-key');
    expect(screen.getByLabelText(/^API key/)).toHaveAttribute(
      'placeholder',
      'Enter a new key to replace the current key'
    );
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Durable workflow API key removed.'
    );
    expect(clearApiKeyMock).toHaveBeenCalledTimes(2);
    expect(useDurableWorkflowsStore.getState().apiKey).toBeNull();
    expect(screen.getByText('No key configured.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove key' })).not.toBeInTheDocument();
  });

  it('guards save immediately and preserves its valid success across its own connection writes', async () => {
    seedStore({ apiKey: 'stored-key' });
    const pending = deferred();
    setConfigurationMock.mockImplementationOnce(async (url: string, key?: string) => {
      connectionGeneration++;
      useDurableWorkflowsStore.setState({ configuring: true });
      await pending.promise;
      useDurableWorkflowsStore.setState({
        engineUrl: url,
        apiKey: key ?? 'stored-key',
        connectionRevision: 'saved-revision',
      });
      useDurableWorkflowsStore.setState({ configuring: false });
    });
    renderWithProviders(<DurableWorkflowSettings />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Engine URL' }), {
      target: { value: 'https://submitted.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(setConfigurationMock).toHaveBeenCalledOnce();
    expect(clearApiKeyMock).not.toHaveBeenCalled();
    expect(healthMock).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
    expect(await screen.findByRole('status')).toHaveTextContent('configuration saved');
    expect(screen.getByRole('textbox', { name: 'Engine URL' })).toHaveValue(
      'https://submitted.example'
    );
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
    act(() => useDurableWorkflowsStore.setState({ connectionRevision: 'external-revision' }));
    expect(screen.queryByText('Durable workflow configuration saved.')).not.toBeInTheDocument();
  });

  it.each(['save', 'test', 'remove'] as const)(
    'blocks %s while another connection write is configuring',
    (operation) => {
      seedStore({ apiKey: 'stored-key', configuring: true });
      renderWithProviders(<DurableWorkflowSettings />);
      const label = { save: 'Save configuration', test: 'Test connection', remove: 'Remove key' }[
        operation
      ];
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(setConfigurationMock).not.toHaveBeenCalled();
      expect(clearApiKeyMock).not.toHaveBeenCalled();
      expect(healthMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['save', 'tenant', false],
    ['save', 'tenant', true],
    ['save', 'generation', false],
    ['save', 'generation', true],
    ['remove', 'tenant', false],
    ['remove', 'tenant', true],
    ['remove', 'generation', false],
    ['remove', 'generation', true],
  ] as const)(
    'suppresses stale %s feedback after a %s change (failed=%s)',
    async (operation, change, failed) => {
      seedStore({ apiKey: 'stored-key' });
      const pending = deferred();
      if (operation === 'save') setConfigurationMock.mockReturnValueOnce(pending.promise);
      else clearApiKeyMock.mockReturnValueOnce(pending.promise);
      renderWithProviders(<DurableWorkflowSettings />);
      fireEvent.click(
        screen.getByRole('button', {
          name: operation === 'save' ? 'Save configuration' : 'Remove key',
        })
      );
      act(() => {
        if (change === 'tenant')
          useAuthStore.setState((state) => ({ tenant: { ...state.tenant!, id: 'tenant-2' } }));
        else changeSavedConnection({ engineUrl: 'https://replacement.example' });
      });
      await act(async () =>
        failed ? pending.reject(new Error('Old mutation failed')) : pending.resolve()
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove key' })).toBeEnabled();
    }
  );

  it('keeps the newer check result when an earlier check finally fails', async () => {
    seedStore({ apiKey: 'stored-key' });
    const older = deferred();
    healthMock.mockReturnValueOnce(older.promise);
    renderWithProviders(<DurableWorkflowSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    act(() => useDurableWorkflowsStore.setState({ connectionRevision: 'newer-connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent('engine is reachable');
    await act(async () => older.reject(new Error('Earlier check failed')));
    expect(screen.getByRole('status')).toHaveTextContent('engine is reachable');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['tenant', 'initialization'] as const)(
    'does not restore completed feedback when %s changes away and back in one update',
    async (field) => {
      seedStore({ apiKey: 'stored-key' });
      renderWithProviders(<DurableWorkflowSettings />);
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
      expect(await screen.findByRole('status')).toHaveTextContent('engine is reachable');
      act(() => {
        if (field === 'tenant') {
          const tenant = useAuthStore.getState().tenant;
          useAuthStore.setState({ tenant: { ...tenant!, id: 'tenant-2' } });
          useAuthStore.setState({ tenant });
        } else {
          useDurableWorkflowsStore.setState({ initialized: false });
          useDurableWorkflowsStore.setState({ initialized: true });
        }
      });
      expect(screen.queryByText('Durable workflow engine is reachable.')).not.toBeInTheDocument();
    }
  );
});
