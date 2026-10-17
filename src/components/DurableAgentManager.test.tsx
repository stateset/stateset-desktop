/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, mockElectronAPI, renderWithProviders, screen, waitFor } from '../test-utils';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { DurableAgentManager } from './DurableAgentManager';

describe('DurableAgentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    vi.stubGlobal('crypto', { randomUUID: () => 'profile-id' });
    useDurableWorkflowsStore.setState({
      initialized: true,
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
});
