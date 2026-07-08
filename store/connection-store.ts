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
  onStdout: ((data: string) => void) | null;

  connect: (host: string, port: number) => void;
  disconnect: () => void;
  send: (msg: OutgoingMsg) => void;
  setOnStdout: (cb: ((data: string) => void) | null) => void;

  listDir: (path: string) => Promise<FileEntry[]>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "disconnected",
  host: "127.0.0.1",
  port: 8080,
  ws: null,
  pending: new Map(),
  onStdout: null,

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
        switch (msg.type) {
          case "connected":
            break;
          case "stdout":
            get().onStdout?.(msg.data);
            break;
          case "list_dir_result": {
            const p = get().pending.get(msg.path);
            if (p) { p.resolve(msg.entries); get().pending.delete(msg.path); }
            break;
          }
          case "read_file_result": {
            const p = get().pending.get(msg.path);
            if (p) { p.resolve(msg.content); get().pending.delete(msg.path); }
            break;
          }
          case "write_file_result": {
            const p = get().pending.get(msg.path);
            if (p) { p.resolve(undefined); get().pending.delete(msg.path); }
            break;
          }
          case "error": {
            const p = get().pending.get("error");
            if (p) { p.reject(new Error(msg.message)); get().pending.delete("error"); }
            break;
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      set({ status: "disconnected", ws: null, pending: new Map() });
    };

    ws.onerror = () => {
      set({ status: "disconnected" });
    };
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.send(JSON.stringify({ type: "disconnect" }));
      ws.close();
    }
    set({ status: "disconnected", ws: null, pending: new Map() });
  },

  send: (msg: OutgoingMsg) => {
    const ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },

  setOnStdout: (cb) => set({ onStdout: cb }),

  listDir: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      state.pending.set(path, { resolve, reject } as Pending);
      state.send({ type: "list_dir", path });
    }),

  readFile: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      state.pending.set(path, { resolve, reject } as Pending);
      state.send({ type: "read_file", path });
    }),

  writeFile: (path: string, content: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      state.pending.set(path, { resolve, reject } as Pending);
      state.send({ type: "write_file", path, content });
    }),
}));
