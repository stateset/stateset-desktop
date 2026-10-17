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
import { BackgroundSettings } from './BackgroundSettings';
import { useDurableWorkflowsStore } from '../../../stores/durableWorkflows';

describe('BackgroundSettings', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI> & {
    background: { setMinimizeToTray: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const api = mockElectronAPI() as ReturnType<typeof mockElectronAPI> & {
      background: { setMinimizeToTray: ReturnType<typeof vi.fn> };
    };
    api.background = { setMinimizeToTray: vi.fn().mockResolvedValue(undefined) };
    electronAPI = api;
    usePreferencesStore.setState({
      minimizeToTray: true,
      autoStartAgentsOnLaunch: true,
    });
    useDurableWorkflowsStore.setState({
      initialized: true,
      engineUrl: 'https://api.workstream.stateset.com',
      apiKey: null,
      workflows: [],
    });
  });

  it('renders the background mode section with both toggles', () => {
    renderWithProviders(<BackgroundSettings />);

    expect(screen.getByText('Background Mode')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Minimize to System Tray' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' })).toBeChecked();
    expect(screen.getByText(/minimize StateSet to the system tray/)).toBeInTheDocument();
  });

  it('reflects disabled store values', () => {
    usePreferencesStore.setState({ minimizeToTray: false, autoStartAgentsOnLaunch: false });
    renderWithProviders(<BackgroundSettings />);

    expect(screen.getByRole('checkbox', { name: 'Minimize to System Tray' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' })).not.toBeChecked();
  });

  it('toggles minimize to tray and notifies the main process', async () => {
    renderWithProviders(<BackgroundSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Minimize to System Tray' }));

    expect(usePreferencesStore.getState().minimizeToTray).toBe(false);
    await waitFor(() => {
      expect(electronAPI.background.setMinimizeToTray).toHaveBeenCalledWith(false);
    });
  });

  it('toggles auto-start agents and persists the change', async () => {
    renderWithProviders(<BackgroundSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' }));

    expect(usePreferencesStore.getState().autoStartAgentsOnLaunch).toBe(false);
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('autoStartAgentsOnLaunch', false);
    });
  });
});
