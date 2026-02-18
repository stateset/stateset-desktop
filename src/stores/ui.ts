import { create } from 'zustand';

export type CommandPaletteAgent = { id: string; agent_type: string; status: string };
export type CommandPaletteAgentWithName = CommandPaletteAgent & { name?: string | null };

interface UiState {
  commandPaletteOpen: boolean;
  commandPaletteAgents: CommandPaletteAgentWithName[];
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCommandPaletteAgents: (agents: CommandPaletteAgentWithName[]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  commandPaletteAgents: [],
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setCommandPaletteAgents: (agents) => set({ commandPaletteAgents: agents }),
}));
