import { create } from "zustand";
import type { IncomingMsg, OutgoingMsg, FileEntry } from "@/lib/types";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface ConnectionState {
  status: "disconnected" | "connecting" | "connected";
  host: string;
  port: number;
  ws: WebSocket | null;
  pending: Map<string, Pending>;
  _nextId: number;
  onStdout: ((data: string) => void) | null;

  connect: (host: string, port: number) => void;
  disconnect: () => void;
  send: (msg: OutgoingMsg) => void;
  setOnStdout: (cb: ((data: string) => void) | null) => void;

  listDir: (path: string) => Promise<FileEntry[]>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  projectPath: string | null;
  setProjectPath: (path: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "disconnected",
  host: "127.0.0.1",
  port: 8080,
  ws: null,
  pending: new Map(),
  _nextId: 1,
  onStdout: null,
  projectPath: null,
  setProjectPath: (path) => set({ projectPath: path }),

  connect: (host: string, port: number) => {
    const old = get().ws;
    if (old) old.close();

    set({ status: "connecting", host, port });
    const ws = new WebSocket(`ws://${host}:${port}`);

    ws.onopen = () => {
      set({ status: "connected", ws });
      ws.send(JSON.stringify({ type: "connect" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: IncomingMsg = JSON.parse(event.data);
        const pending = get().pending;

        switch (msg.type) {
          case "connected":
            break;
          case "stdout":
            get().onStdout?.(msg.data);
            break;
          case "list_dir_result": {
            // Prefer id-keyed lookup; fall back to path for old bridge versions
            const key = msg.id ?? msg.path;
            const p = pending.get(key);
            if (p) { p.resolve(msg.entries); pending.delete(key); }
            break;
          }
          case "read_file_result": {
            const key = msg.id ?? msg.path;
            const p = pending.get(key);
            if (p) { p.resolve(msg.content); pending.delete(key); }
            break;
          }
          case "write_file_result": {
            const key = msg.id ?? msg.path;
            const p = pending.get(key);
            if (p) { p.resolve(undefined); pending.delete(key); }
            break;
          }
          case "error": {
            // Try id first, then path, then a generic "error" key
            const key = msg.id ?? msg.path ?? "error";
            const p = pending.get(key);
            if (p) { p.reject(new Error(msg.message)); pending.delete(key); }
            break;
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      set({ status: "disconnected", ws: null, pending: new Map(), projectPath: null });
    };

    ws.onerror = () => {
      set({ status: "disconnected", projectPath: null });
    };
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.send(JSON.stringify({ type: "disconnect" }));
      ws.close();
    }
    set({ status: "disconnected", ws: null, pending: new Map(), projectPath: null });
  },

  send: (msg: OutgoingMsg) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },

  setOnStdout: (cb) => set({ onStdout: cb }),

  listDir: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject } as Pending);
      state.send({ type: "list_dir", path, id });
    }),

  readFile: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject } as Pending);
      state.send({ type: "read_file", path, id });
    }),

  writeFile: (path: string, content: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject } as Pending);
      state.send({ type: "write_file", path, content, id });
    }),
}));
