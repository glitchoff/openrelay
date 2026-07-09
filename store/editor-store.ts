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

const SESSION_KEY = "openrelay:editor_session";

function saveSession(openFiles: Record<string, OpenFile>, activeFile: string | null) {
  try {
    const paths = Object.keys(openFiles);
    if (!paths.length) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ paths, activeFile }));
  } catch {}
}

export function getSavedSession(): { paths: string[]; activeFile: string | null } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSavedSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export const useEditorStore = create<EditorState>((set) => ({
  openFiles: {},
  activeFile: null,

  openFile: (path, content) =>
    set((s) => {
      const next = {
        openFiles: { ...s.openFiles, [path]: { path, content, dirty: false } },
        activeFile: path,
      };
      saveSession(next.openFiles, next.activeFile);
      return next;
    }),

  closeFile: (path) =>
    set((s) => {
      const { [path]: _, ...rest } = s.openFiles;
      const next = {
        openFiles: rest,
        activeFile: s.activeFile === path
          ? Object.keys(rest)[0] ?? null
          : s.activeFile,
      };
      saveSession(next.openFiles, next.activeFile);
      return next;
    }),

  setActiveFile: (path) => {
    set((s) => {
      const next = { activeFile: path };
      saveSession(s.openFiles, path);
      return next;
    });
  },

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
