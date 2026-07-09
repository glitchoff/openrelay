import { create } from "zustand";

export interface TerminalSession {
  id: string;
  title: string;
  ptyId: number | null;
}

interface TerminalState {
  terminals: TerminalSession[];
  activeTerminal: string;

  addTerminal: () => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setPtyId: (id: string, ptyId: number) => void;
  clearPtys: () => void;
}

let termCounter = 0;

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: [{ id: "term-0", title: "Terminal", ptyId: null }],
  activeTerminal: "term-0",

  addTerminal: () => {
    termCounter++;
    const id = `term-${termCounter}`;
    set((s) => ({
      terminals: [...s.terminals, { id, title: `Terminal ${termCounter}`, ptyId: null }],
      activeTerminal: id,
    }));
  },

  removeTerminal: (id) =>
    set((s) => {
      const rest = s.terminals.filter((t) => t.id !== id);
      return {
        terminals: rest,
        activeTerminal:
          s.activeTerminal === id
            ? rest[rest.length - 1]?.id ?? "term-0"
            : s.activeTerminal,
      };
    }),

  setActiveTerminal: (id) => set({ activeTerminal: id }),

  setTitle: (id, title) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setPtyId: (id, ptyId) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, ptyId } : t)),
    })),

  clearPtys: () =>
    set((s) => ({
      terminals: s.terminals.map((t) => ({ ...t, ptyId: null })),
    })),
}));
