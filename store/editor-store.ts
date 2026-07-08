import { create } from "zustand";

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
}

interface EditorState {
  openFiles: Record<string, OpenFile>;
  activeFile: string | null;

  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (path: string, content: string) => void;
  markClean: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  openFiles: {},
  activeFile: null,

  openFile: (path, content) =>
    set((s) => ({
      openFiles: { ...s.openFiles, [path]: { path, content, dirty: false } },
      activeFile: path,
    })),

  closeFile: (path) =>
    set((s) => {
      const { [path]: _, ...rest } = s.openFiles;
      return {
        openFiles: rest,
        activeFile: s.activeFile === path
          ? Object.keys(rest)[0] ?? null
          : s.activeFile,
      };
    }),

  setActiveFile: (path) => set({ activeFile: path }),

  setFileContent: (path, content) =>
    set((s) => {
      const file = s.openFiles[path];
      if (!file) return s;
      return {
        openFiles: { ...s.openFiles, [path]: { ...file, content, dirty: true } },
      };
    }),

  markClean: (path) =>
    set((s) => {
      const file = s.openFiles[path];
      if (!file) return s;
      return {
        openFiles: { ...s.openFiles, [path]: { ...file, dirty: false } },
      };
    }),
}));
