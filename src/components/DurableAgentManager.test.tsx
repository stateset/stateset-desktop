/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  mockElectronAPI,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../test-utils';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { DURABLE_AGENT_PROFILES } from '../lib/durableAgentProfiles';
import { DurableAgentManager } from './DurableAgentManager';

function fillDraft() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Inventory investigator' } });
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Reviews inventory evidence' },
  });
  fireEvent.change(screen.getByLabelText('Instructions'), {
    target: { value: 'Inspect inventory evidence and report discrepancies.' },
  });
}

function deferredWrite() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const savedProfile = {
  ...DURABLE_AGENT_PROFILES[0],
  id: 'custom-saved',
  name: 'Saved investigator',
};

describe('DurableAgentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    let nextId = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => (++nextId === 1 ? 'profile-id' : `profile-id-${nextId}`),
    });
    useDurableWorkflowsStore.setState({
      initialized: true,
      initializationError: null,
      customAgents: [],
      workflows: [],
      blueprints: [],
    });
  });

  it('creates and selects a reusable bounded agent', async () => {
    const onCreated = vi.fn();
    renderWithProviders(<DurableAgentManager isOpen onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Inventory investigator' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Checks inventory discrepancies' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Inspect inventory evidence and report discrepancies.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-profile-id',
        name: 'Inventory investigator',
        allowedExecutables: expect.arrayContaining(['rg', 'jq']),
      })
    );
    expect(useDurableWorkflowsStore.getState().customAgents[0].name).toBe('Inventory investigator');
  });

  it('guards a pending save, preserves the draft after a failed acknowledgement, and permits retry', async () => {
    const electron = mockElectronAPI();
    const pending = deferredWrite();
    electron.store.set.mockReturnValueOnce(pending.promise);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<DurableAgentManager isOpen onClose={onClose} onCreated={onCreated} />);
    fillDraft();
    const create = screen.getByRole('button', { name: 'Create agent' });
    create.focus();
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() => expect(electron.store.set).toHaveBeenCalledTimes(1));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Creating agent…');
    expect(status).toHaveFocus();
    // Happy DOM has no layout; this pending status is visible in the modal.
    Object.defineProperty(status, 'offsetParent', { get: () => status.parentElement });
    for (const shiftKey of [false, true]) {
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(status, tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(status).toHaveFocus();
    }
    for (const label of [
      'Name',
      'Description',
      'Instructions',
      'Max actions',
      'Total token budget',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'rg' })).toBeDisabled();
    expect(create).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().customAgents).toEqual([]);

    pending.resolve(false);
    expect(await screen.findByText('Unable to save agent')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Inventory investigator');
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveValue(
      'Inspect inventory evidence and report discrepancies.'
    );
    expect(screen.queryByText('Agent profile created')).not.toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    await waitFor(() => expect(create).toBeEnabled());
    expect(create).toHaveFocus();
    fireEvent.click(create);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(electron.store.set).toHaveBeenCalledTimes(2);
    expect(useDurableWorkflowsStore.getState().customAgents).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('retains the saved profile and unrelated draft through a failed removal, then retries', async () => {
    const electron = mockElectronAPI();
    const pending = deferredWrite();
    electron.store.set.mockReturnValueOnce(pending.promise);
    useDurableWorkflowsStore.setState({ customAgents: [savedProfile] });
    const onCreated = vi.fn();
    renderWithProviders(<DurableAgentManager isOpen onClose={vi.fn()} onCreated={onCreated} />);
    fillDraft();
    const remove = screen.getByRole('button', { name: 'Remove Saved investigator' });
    remove.focus();
    fireEvent.click(remove);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove profile' })
    );
    await waitFor(() => expect(electron.store.set).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Removing profile…');
    expect(remove).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeDisabled();
    expect(useDurableWorkflowsStore.getState().customAgents).toEqual([savedProfile]);
    pending.resolve(false);
    expect(await screen.findByText('Unable to remove agent')).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Agent profile Saved investigator' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Inventory investigator');
    expect(screen.queryByText('Agent profile removed')).not.toBeInTheDocument();
    await waitFor(() => expect(remove).toBeEnabled());
    expect(remove).toHaveFocus();
    fireEvent.click(remove);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove profile' })
    );
    expect(await screen.findByText('Agent profile removed')).toBeInTheDocument();
    expect(electron.store.set).toHaveBeenCalledTimes(2);
    expect(useDurableWorkflowsStore.getState().customAgents).toEqual([]);
    expect(screen.getByLabelText('Name')).toHaveValue('Inventory investigator');
    expect(screen.getByLabelText('Instructions')).toHaveValue(
      'Inspect inventory evidence and report discrepancies.'
    );
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('cancels removal without closing the editor or leaving its controls locked', async () => {
    const electron = mockElectronAPI();
    useDurableWorkflowsStore.setState({ customAgents: [savedProfile] });
    const onClose = vi.fn();
    renderWithProviders(<DurableAgentManager isOpen onClose={onClose} onCreated={vi.fn()} />);
    fillDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Saved investigator' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(electron.store.set).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Inventory investigator');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create agent' })).toBeEnabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps mutations disabled and saved state truthful until settings are loaded', () => {
    const electron = mockElectronAPI();
    useDurableWorkflowsStore.setState({
      initialized: false,
      initializationError: 'Saved settings could not be loaded.',
    });
    const onCreated = vi.fn();
    renderWithProviders(<DurableAgentManager isOpen onClose={vi.fn()} onCreated={onCreated} />);
    expect(
      screen.getByText('Saved agents are unavailable until settings load.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No custom agents yet')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeDisabled();
    expect(electron.store.set).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
