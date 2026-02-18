import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './ui';

beforeEach(() => {
  useUiStore.setState({
    commandPaletteOpen: false,
    commandPaletteAgents: [],
  });
});

describe('useUiStore', () => {
  it('has correct initial state', () => {
    const state = useUiStore.getState();
    expect(state.commandPaletteOpen).toBe(false);
    expect(state.commandPaletteAgents).toEqual([]);
  });

  it('openCommandPalette() sets commandPaletteOpen to true', () => {
    useUiStore.getState().openCommandPalette();
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
  });

  it('closeCommandPalette() sets commandPaletteOpen to false', () => {
    useUiStore.getState().openCommandPalette();
    useUiStore.getState().closeCommandPalette();
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('setCommandPaletteOpen(true/false) works', () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    useUiStore.getState().setCommandPaletteOpen(false);
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('setCommandPaletteAgents() sets the agents array', () => {
    const agents = [
      { id: '1', agent_type: 'interactive', status: 'running', name: 'Agent 1' },
      { id: '2', agent_type: 'autonomous', status: 'stopped' },
    ];
    useUiStore.getState().setCommandPaletteAgents(agents);
    expect(useUiStore.getState().commandPaletteAgents).toEqual(agents);
  });

  it('setCommandPaletteAgents() replaces previous agents', () => {
    useUiStore
      .getState()
      .setCommandPaletteAgents([{ id: '1', agent_type: 'interactive', status: 'running' }]);
    const newAgents = [{ id: '2', agent_type: 'autonomous', status: 'stopped' }];
    useUiStore.getState().setCommandPaletteAgents(newAgents);
    expect(useUiStore.getState().commandPaletteAgents).toEqual(newAgents);
    expect(useUiStore.getState().commandPaletteAgents).toHaveLength(1);
  });
});
