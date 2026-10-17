/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderWithProviders,
  mockElectronAPI,
  screen,
  fireEvent,
  waitFor,
} from '../../../test-utils';
import { usePreferencesStore } from '../../../stores/preferences';
import { AppearanceSettings } from './AppearanceSettings';

describe('AppearanceSettings', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    electronAPI = mockElectronAPI();
    usePreferencesStore.setState({
      theme: 'dark',
      reduceMotion: false,
      compactMode: false,
      refreshInterval: 5000,
      pageSize: 10,
    });
  });

  it('renders all preference controls', () => {
    renderWithProviders(<AppearanceSettings />);

    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light theme' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Compact Mode' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Reduce Motion' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Refresh Interval' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Page Size' })).toBeInTheDocument();
  });

  it('marks the active theme button as pressed', () => {
    renderWithProviders(<AppearanceSettings />);

    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('switches theme to light and persists it', async () => {
    renderWithProviders(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('theme', 'light');
    });
  });

  it('toggles compact mode and persists it', async () => {
    renderWithProviders(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Compact Mode' }));

    expect(usePreferencesStore.getState().compactMode).toBe(true);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('compactMode', true);
    });
  });

  it('toggles reduce motion and persists it', async () => {
    usePreferencesStore.setState({ reduceMotion: true });
    renderWithProviders(<AppearanceSettings />);

    const toggle = screen.getByRole('checkbox', { name: 'Reduce Motion' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(usePreferencesStore.getState().reduceMotion).toBe(false);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('reduceMotion', false);
    });
  });

  it('changes the refresh interval and persists it', async () => {
    renderWithProviders(<AppearanceSettings />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Refresh Interval' }), {
      target: { value: '30000' },
    });

    expect(usePreferencesStore.getState().refreshInterval).toBe(30000);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('refreshInterval', 30000);
    });
  });

  it('changes the page size and persists it', async () => {
    renderWithProviders(<AppearanceSettings />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Page Size' }), {
      target: { value: '50' },
    });

    expect(usePreferencesStore.getState().pageSize).toBe(50);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('pageSize', 50);
    });
  });

  it('reflects current store values in the selects', () => {
    usePreferencesStore.setState({ refreshInterval: 60000, pageSize: 100 });
    renderWithProviders(<AppearanceSettings />);

    expect(screen.getByRole('combobox', { name: 'Refresh Interval' })).toHaveValue('60000');
    expect(screen.getByRole('combobox', { name: 'Page Size' })).toHaveValue('100');
  });
});
