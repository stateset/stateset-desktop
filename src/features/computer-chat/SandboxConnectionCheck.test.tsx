/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SandboxConnectionCheck } from './SandboxConnectionCheck';
import { computerSessionApi } from './api';
import { useAuthStore } from '../../stores/auth';
import { SandboxRequestError } from '../../lib/sandbox';

const capabilities = {
  version: 1 as const,
  organization_id: 'sandbox-org',
  computer_use: true,
  inference_ready: true,
  workspace_evidence: true,
  max_artifact_bytes: 131072,
};
beforeEach(() => {
  useAuthStore.setState({
    sandboxApiKey: 'saved-key',
    tenant: { id: 'tenant' },
    currentBrand: { id: 'brand' },
  } as never);
  vi.spyOn(computerSessionApi, 'capabilities').mockResolvedValue(capabilities);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = (editing = false) =>
  render(<SandboxConnectionCheck tenantId="tenant" brandId="brand" editing={editing} />);
const click = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Check Sandbox connection' }));

it('only checks on demand and qualifies declared capabilities without claiming execution or credits', async () => {
  mount();
  expect(computerSessionApi.capabilities).not.toHaveBeenCalled();
  click();
  await screen.findByText('Sandbox capabilities confirmed');
  expect(computerSessionApi.capabilities).toHaveBeenCalledOnce();
  expect(screen.getByRole('status', { name: 'Sandbox connection check' })).toHaveTextContent(
    'does not test model credits, actual execution, NSR policy decisions or durable workflows'
  );
  expect(screen.queryByText(/saved-key/)).toBeNull();
});

it('reports missing model configuration without presenting the connection as ready', async () => {
  vi.mocked(computerSessionApi.capabilities).mockResolvedValue({
    ...capabilities,
    inference_ready: false,
  });
  mount();
  click();
  await screen.findByText('Sandbox connected; setup needs attention');
  expect(screen.getByRole('status', { name: 'Sandbox connection check' })).toHaveTextContent(
    'configure model access'
  );
  expect(screen.queryByText('Sandbox capabilities confirmed')).toBeNull();
});

it('retains the saved key and hides server error bodies when a connection check is rejected', async () => {
  vi.mocked(computerSessionApi.capabilities).mockRejectedValue(
    new SandboxRequestError('private backend response', 403)
  );
  mount();
  click();
  await screen.findByText(/Sandbox access was rejected/);
  expect(useAuthStore.getState().sandboxApiKey).toBe('saved-key');
  expect(screen.queryByText(/private backend/)).toBeNull();
});

it('does not check missing keys or unsaved key edits', () => {
  const view = mount(true);
  expect(screen.getByRole('button', { name: 'Check Sandbox connection' })).toBeDisabled();
  expect(screen.getByText(/Save or clear your key edits/)).toBeVisible();
  act(() => useAuthStore.setState({ sandboxApiKey: null }));
  view.rerender(<SandboxConnectionCheck tenantId="tenant" brandId="brand" editing={false} />);
  expect(screen.getByRole('button', { name: 'Check Sandbox connection' })).toBeDisabled();
  click();
  expect(computerSessionApi.capabilities).not.toHaveBeenCalled();
});

it.each(['key', 'brand', 'tenant', 'edits', 'unmount'] as const)(
  'aborts an old check and ignores a late response after changing %s',
  async (change) => {
    let finish!: (value: typeof capabilities) => void;
    let signal!: AbortSignal;
    vi.mocked(computerSessionApi.capabilities).mockImplementation((value) => {
      signal = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const view = mount();
    click();
    expect(computerSessionApi.capabilities).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Checking Sandbox…' }));
    expect(computerSessionApi.capabilities).toHaveBeenCalledOnce();
    if (change === 'key') act(() => useAuthStore.setState({ sandboxApiKey: 'new-key' }));
    else if (change === 'brand')
      act(() => useAuthStore.setState({ currentBrand: { id: 'other' } } as never));
    else if (change === 'tenant')
      act(() => useAuthStore.setState({ tenant: { id: 'other' } } as never));
    else if (change === 'edits')
      view.rerender(<SandboxConnectionCheck tenantId="tenant" brandId="brand" editing />);
    else view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(capabilities));
    expect(screen.queryByText('Sandbox capabilities confirmed')).toBeNull();
  }
);

it('invalidates a successful result as soon as the saved key changes', async () => {
  mount();
  click();
  await screen.findByText('Sandbox capabilities confirmed');
  act(() => useAuthStore.setState({ sandboxApiKey: 'changed-key' }));
  expect(screen.queryByText('Sandbox capabilities confirmed')).toBeNull();
});
