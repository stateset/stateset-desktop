/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
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

async function renderSettings() {
  await act(async () => {
    renderWithProviders(<BackgroundSettings />);
  });
}

describe('BackgroundSettings', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI> & {
    background: { setMinimizeToTray: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const api = mockElectronAPI() as ReturnType<typeof mockElectronAPI> & {
      background: { setMinimizeToTray: ReturnType<typeof vi.fn> };
    };
    api.background = { setMinimizeToTray: vi.fn().mockResolvedValue(true) };
    electronAPI = api;
    usePreferencesStore.setState({
      initialized: true,
      saves: {},
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

  it('renders the background mode section with both toggles', async () => {
    await renderSettings();

    expect(screen.getByText('Background Mode')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Minimize to System Tray' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' })).toBeChecked();
    expect(screen.getByText(/minimize StateSet to the system tray/)).toBeInTheDocument();
  });

  it('reflects disabled store values', async () => {
    usePreferencesStore.setState({ minimizeToTray: false, autoStartAgentsOnLaunch: false });
    await renderSettings();

    expect(screen.getByRole('checkbox', { name: 'Minimize to System Tray' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' })).not.toBeChecked();
  });

  it('toggles minimize to tray and notifies the main process', async () => {
    await renderSettings();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Minimize to System Tray' }));

    await waitFor(() => expect(usePreferencesStore.getState().minimizeToTray).toBe(false));
    await waitFor(() => {
      expect(electronAPI.background.setMinimizeToTray).toHaveBeenCalledWith(false);
    });
  });

  it('toggles auto-start agents and persists the change', async () => {
    await renderSettings();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-start Agents on Launch' }));

    await waitFor(() => expect(usePreferencesStore.getState().autoStartAgentsOnLaunch).toBe(false));
    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('autoStartAgentsOnLaunch', false);
    });
  });
});
