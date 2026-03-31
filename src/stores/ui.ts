import { create } from 'zustand';

export type CommandPaletteAgent = { id: string; agent_type: string; status: string };
export type CommandPaletteAgentWithName = CommandPaletteAgent & { name?: string | null };

interface UiState {
  commandPaletteOpen: boolean;
  commandPaletteAgents: CommandPaletteAgentWithName[];
  sidebarCollapsed: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCommandPaletteAgents: (agents: CommandPaletteAgentWithName[]) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  commandPaletteAgents: [],
  sidebarCollapsed: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setCommandPaletteAgents: (agents) => set({ commandPaletteAgents: agents }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
