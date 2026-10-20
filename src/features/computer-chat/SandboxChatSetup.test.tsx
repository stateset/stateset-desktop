/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SandboxChatSetup } from './SandboxChatSetup';
import { localSecretsApi } from '../../lib/localSecrets';
import { useAuthStore } from '../../stores/auth';
import { POLICY_CONNECTION } from './api';

const originalSave = useAuthStore.getState().setSandboxApiKey;
let saveSandbox: ReturnType<typeof vi.fn>;
beforeEach(() => {
  saveSandbox = vi.fn().mockImplementation(async (key: string) => {
    useAuthStore.setState({ sandboxApiKey: key });
  });
  useAuthStore.setState({
    tenant: { id: 'tenant' },
    currentBrand: { id: 'brand' },
    sandboxApiKey: 'existing-sandbox-key',
    setSandboxApiKey: saveSandbox,
  } as never);
  window.electronAPI = {
    auth: { isSecureStorageAvailable: vi.fn().mockResolvedValue(true) },
  } as never;
  vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue(null);
  vi.spyOn(localSecretsApi, 'storeCredentials').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ setSandboxApiKey: originalSave });
});
const mount = (onError = vi.fn()) =>
  render(<SandboxChatSetup tenantId="tenant" brandId="brand" onError={onError} />);
const enter = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save API keys' }));
  });
};

it('shows local setup gaps for this brand without claiming live access or allocating compute', async () => {
  mount();
  await screen.findByText('Add an NSR policy API key');
  expect(screen.getByText('Sandbox key saved')).toBeVisible();
  expect(screen.getByText(/Saved keys have not been tested against live services/)).toBeVisible();
  expect(localSecretsApi.getCredentials).toHaveBeenCalledWith('tenant', 'brand', POLICY_CONNECTION);
  expect(saveSandbox).not.toHaveBeenCalled();
  expect(localSecretsApi.storeCredentials).not.toHaveBeenCalled();
  expect(screen.getByLabelText('NSR policy API key', { exact: true })).toHaveAccessibleDescription(
    /selected organization and brand/
  );
});

it('distinguishes a vault read failure from a missing policy key', async () => {
  vi.mocked(localSecretsApi.getCredentials).mockRejectedValue(new Error('vault unavailable'));
  mount();
  await screen.findByText('Saved NSR key could not be read');
  expect(screen.queryByText('Add an NSR policy API key')).toBeNull();
});

it('confirms scoped saves and ignores a slower initial read of the old vault', async () => {
  let finishRead!: (value: null) => void;
  vi.mocked(localSecretsApi.getCredentials).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      })
  );
  mount();
  enter('NSR policy API key', '  new-policy-key  ');
  await save();
  expect(localSecretsApi.storeCredentials).toHaveBeenCalledWith(
    'tenant',
    'brand',
    POLICY_CONNECTION,
    { api_key: 'new-policy-key' }
  );
  expect(screen.getByText('API keys saved')).toBeVisible();
  expect(screen.getByLabelText('NSR policy API key', { exact: true })).toHaveValue('');
  await act(async () => finishRead(null));
  expect(screen.getByText('NSR key saved for this brand')).toBeVisible();
});

it('retains the failed policy entry and reports a partial save accurately', async () => {
  const onError = vi.fn();
  vi.mocked(localSecretsApi.storeCredentials).mockRejectedValueOnce(
    new Error('private backend detail')
  );
  mount(onError);
  enter('Sandbox API key', 'new-sandbox-key');
  enter('NSR policy API key', 'retain-policy-key');
  await save();
  expect(screen.getByLabelText('Sandbox API key', { exact: true })).toHaveValue('');
  expect(screen.getByLabelText('NSR policy API key', { exact: true })).toHaveValue(
    'retain-policy-key'
  );
  expect(onError).toHaveBeenLastCalledWith(
    expect.stringContaining('Sandbox API key saved. The NSR policy key could not be saved.')
  );
  expect(JSON.stringify(onError.mock.calls)).not.toContain('private backend detail');
  expect(screen.queryByText('API keys saved')).toBeNull();
  await save();
  expect(saveSandbox).toHaveBeenCalledOnce();
  expect(screen.getByText('NSR key saved for this brand')).toBeVisible();
});

it('does not continue a key save or show late errors after changing brands', async () => {
  let finish!: () => void;
  saveSandbox.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const onError = vi.fn();
  const view = mount(onError);
  enter('Sandbox API key', 'old-brand-sandbox-key');
  enter('NSR policy API key', 'old-brand-policy-key');
  fireEvent.click(screen.getByRole('button', { name: 'Save API keys' }));
  expect(saveSandbox).toHaveBeenCalledOnce();
  act(() => useAuthStore.setState({ currentBrand: { id: 'other' } } as never));
  view.rerender(
    <SandboxChatSetup key="other" tenantId="tenant" brandId="other" onError={onError} />
  );
  await act(async () => finish());
  expect(localSecretsApi.storeCredentials).not.toHaveBeenCalled();
  expect(screen.getByLabelText('NSR policy API key', { exact: true })).toHaveValue('');
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenLastCalledWith('');
});

it('blocks placeholder keys without removing an existing connection', async () => {
  mount();
  enter('Sandbox API key', 'placeholder');
  expect(screen.getByLabelText('Sandbox API key', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Placeholder Sandbox keys cannot be used.');
  expect(screen.getByRole('button', { name: 'Save API keys' })).toBeDisabled();
  expect(useAuthStore.getState().sandboxApiKey).toBe('existing-sandbox-key');
  expect(saveSandbox).not.toHaveBeenCalled();
});

it('guards repeated saves and keeps entries when the first save is rejected', async () => {
  let reject!: (reason: Error) => void;
  saveSandbox.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  const onError = vi.fn();
  mount(onError);
  enter('Sandbox API key', 'retain-sandbox-key');
  enter('NSR policy API key', 'retain-policy-key');
  const button = screen.getByRole('button', { name: 'Save API keys' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(saveSandbox).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('write failed')));
  expect(screen.getByLabelText('Sandbox API key', { exact: true })).toHaveValue(
    'retain-sandbox-key'
  );
  expect(screen.getByLabelText('NSR policy API key', { exact: true })).toHaveValue(
    'retain-policy-key'
  );
  expect(localSecretsApi.storeCredentials).not.toHaveBeenCalled();
  expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('Your entries are still here'));
});

it('explains that both keys are temporary when the system keyring is unavailable', async () => {
  vi.mocked(window.electronAPI!.auth.isSecureStorageAvailable).mockResolvedValue(false);
  mount();
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Both API keys last until you quit the app.'
    )
  );
});
