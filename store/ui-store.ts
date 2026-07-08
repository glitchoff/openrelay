import { create } from "zustand";

type Panel = "explorer" | "terminal";

interface UiState {
  openPanels: Panel[];
  activeView: "editor" | "explorer" | "terminal";

  togglePanel: (panel: Panel) => void;
  openPanel: (panel: Panel) => void;
  closePanel: (panel: Panel) => void;
  setActiveView: (view: UiState["activeView"]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  openPanels: [],
  activeView: "editor",

  togglePanel: (panel) =>
    set((s) => ({
      openPanels: s.openPanels.includes(panel)
        ? s.openPanels.filter((p) => p !== panel)
        : [...s.openPanels, panel],
    })),

  openPanel: (panel) =>
    set((s) => ({
      openPanels: s.openPanels.includes(panel) ? s.openPanels : [...s.openPanels, panel],
    })),

  closePanel: (panel) =>
    set((s) => ({
      openPanels: s.openPanels.filter((p) => p !== panel),
    })),

  setActiveView: (view) => set({ activeView: view }),
}));
