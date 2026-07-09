import { create } from "zustand";
import { useEditorStore } from "./editor-store";
import { useTerminalStore } from "./terminal-store";

export type TabType = "file" | "terminal";

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  dirty: boolean;
}

interface TabState {
  tabs: Tab[];
  activeTab: string | null;

  upsertTab: (id: string, type: TabType, title: string, dirty?: boolean) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  setDirty: (id: string, dirty: boolean) => void;
  setTitle: (id: string, title: string) => void;
}

export const useTabStore = create<TabState>((set) => ({
  tabs: [],
  activeTab: null,

  upsertTab: (id, type, title, dirty = false) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.id === id);
      if (existing) {
        return {
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, title, dirty } : t)),
        };
      }
      return { tabs: [...s.tabs, { id, type, title, dirty }] };
    }),

  removeTab: (id) =>
    set((s) => {
      const rest = s.tabs.filter((t) => t.id !== id);
      return {
        tabs: rest,
        activeTab:
          s.activeTab === id
            ? rest[rest.length - 1]?.id ?? null
            : s.activeTab,
      };
    }),

  setActiveTab: (id) => {
    const state = useTabStore.getState();
    const tab = state.tabs.find((t) => t.id === id);
    if (tab && id !== null) {
      if (tab.type === "file") {
        useEditorStore.setState({ activeFile: id });
      } else {
        useTerminalStore.setState({ activeTerminal: id });
      }
    }
    set({ activeTab: id });
  },

  setDirty: (id, dirty) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
    })),

  setTitle: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),
}));
