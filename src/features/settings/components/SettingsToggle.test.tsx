/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsToggle } from './SettingsToggle';
import { usePreferencesStore } from '../../../stores/preferences';
import { applyTelemetryConsent, initializeTelemetry } from '../../../lib/telemetry';
import { mockElectronAPI } from '../../../test-utils';
let api: ReturnType<typeof mockElectronAPI>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function Field({ privacy = false }: { privacy?: boolean }) {
  const key = privacy ? 'telemetryEnabled' : 'soundAlerts';
  const checked = usePreferencesStore((s) => s[key]);
  return (
    <SettingsToggle
      preference={key}
      label={privacy ? 'Share anonymous usage data' : 'Sound Alerts'}
      description="Owned setting help"
      checked={checked}
      onChange={
        privacy
          ? usePreferencesStore.getState().setTelemetryEnabled
          : usePreferencesStore.getState().setSoundAlerts
      }
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api = mockElectronAPI();
  usePreferencesStore.setState({
    initialized: true,
    saves: {},
    soundAlerts: true,
    telemetryEnabled: false,
  });
});
afterEach(() => {
  applyTelemetryConsent(false);
});
it('shows pending intent, keeps focus, then exposes failed saves and a retry without leaking native errors', async () => {
  const write = deferred<boolean>();
  api.store.set.mockReturnValueOnce(write.promise);
  render(<Field />);
  const input = screen.getByRole('checkbox', { name: 'Sound Alerts' });
  input.focus();
  fireEvent.click(input);
  expect(input).not.toBeChecked();
  expect(input).toHaveAttribute('aria-busy', 'true');
  expect(input).toHaveFocus();
  fireEvent.click(input);
  expect(api.store.set).not.toHaveBeenCalled();
  await act(async () => {
    write.reject(new Error('Owned PRIVATE native failure'));
  });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This change could not be saved. Try again.'
    )
  );
  expect(input).toBeChecked();
  expect(input).toHaveAccessibleName('Sound Alerts');
  expect(input).toHaveAccessibleDescription(/Owned setting help/);
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
  const retry = screen.getByRole('button', { name: 'Retry saving Sound Alerts' });
  retry.focus();
  fireEvent.click(retry);
  await waitFor(() => expect(input).not.toBeChecked());
  await waitFor(() => expect(input).toHaveFocus());
  expect(screen.queryByRole('alert')).toBeNull();
});
it('retains a failed intent across navigation and retries that intent', async () => {
  api.store.set.mockResolvedValueOnce(false);
  const view = render(<Field />);
  fireEvent.click(screen.getByRole('checkbox'));
  await screen.findByRole('alert');
  view.unmount();
  render(<Field />);
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('alert')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving Sound Alerts' }));
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
  expect(api.store.set).toHaveBeenLastCalledWith('soundAlerts', false);
});
it('allows privacy opt-out to cancel a pending opt-in and never starts collection', async () => {
  const collector = initializeTelemetry({ enabled: false });
  const write = deferred<boolean>();
  api.store.set.mockReturnValueOnce(write.promise);
  render(<Field privacy />);
  const input = screen.getByRole('checkbox');
  fireEvent.click(input);
  expect(input).toBeChecked();
  expect(input).toHaveAttribute('aria-busy', 'true');
  expect(collector.isEnabled()).toBe(false);
  fireEvent.click(input);
  expect(input).not.toBeChecked();
  await act(async () => {
    write.resolve(true);
  });
  await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'false'));
  expect(input).not.toBeChecked();
  expect(collector.isEnabled()).toBe(false);
});
it('keeps sharing off locally and describes an unsaved restart preference after an opt-out failure', async () => {
  const collector = initializeTelemetry({ enabled: false });
  collector.enable({ persist: false });
  usePreferencesStore.setState({ telemetryEnabled: true });
  api.store.set.mockRejectedValueOnce(new Error('Owned write error'));
  render(<Field privacy />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(collector.isEnabled()).toBe(false);
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sharing is off for this session. Your restart preference could not be saved.'
    )
  );
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(collector.isEnabled()).toBe(false);
});
it('blocks unconfirmed loaded values and offers a read retry', async () => {
  api.store.get.mockRejectedValue(new Error('Owned read error'));
  usePreferencesStore.setState({ initialized: false });
  await act(async () => {
    await usePreferencesStore.getState().initialize();
  });
  render(<Field />);
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('checkbox'));
  expect(api.store.set).not.toHaveBeenCalled();
  api.store.get.mockImplementation(async (key: string) =>
    key === 'soundAlerts' ? false : undefined
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading Sound Alerts' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
