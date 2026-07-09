import { create } from "zustand";
import type { IncomingMsg, OutgoingMsg, FileEntry } from "@/lib/types";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  path: string;
}

interface ConnectionState {
  status: "disconnected" | "connecting" | "connected";
  host: string;
  port: number;
  ws: WebSocket | null;
  pending: Map<string, Pending>;
  _pathToId: Map<string, string>; // path → latest req id (for old bridges)
  _nextId: number;
  onStdout: ((data: string) => void) | null;

  connect: (host: string, port: number, password?: string) => void;
  disconnect: () => void;
  send: (msg: OutgoingMsg) => void;
  setOnStdout: (cb: ((data: string) => void) | null) => void;

  listDir: (path: string) => Promise<FileEntry[]>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  createDir: (path: string) => Promise<void>;
  rename: (old_path: string, new_path: string) => Promise<void>;
  projectPath: string | null;
  setProjectPath: (path: string | null) => void;
  connectionError: string | null;
  _initialPtyId: number | null;
  _ptyStdout: Map<number, (data: string) => void>;
  takeInitialPty: () => number | null;
  createPty: (cwd?: string) => Promise<number>;
  closePty: (ptyId: number) => void;
  setOnPtyStdout: (ptyId: number, cb: ((data: string) => void) | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "disconnected",
  host: "127.0.0.1",
  port: 8080,
  ws: null,
  pending: new Map(),
  _pathToId: new Map(),
  _nextId: 1,
  onStdout: null,
  _initialPtyId: null,
  _ptyStdout: new Map<number, (data: string) => void>(),
  projectPath: null,
  setProjectPath: (path) => set({ projectPath: path }),
  connectionError: null,

  connect: (host: string, port: number, password?: string) => {
    const { status, host: curHost, port: curPort } = get();
    // Reuse existing connection if already live or connecting to same target
    if (
      (status === "connected" || status === "connecting") &&
      curHost === host &&
      curPort === port
    ) return;

    const old = get().ws;
    if (old) old.close();

    const ws = new WebSocket(`ws://${host}:${port}`);
    // Store ws immediately so onclose/onerror identity guards work
    // even if the connection fails before onopen fires
    set({ status: "connecting", host, port, ws, connectionError: null });

    ws.onopen = () => {
      set({ status: "connected" });
      const msg: any = { type: "connect" };
      if (password) msg.password = password;
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      try {
        const msg: IncomingMsg = JSON.parse(event.data);
        const { pending, _pathToId, _ptyStdout } = get();

        const resolveKey = (msgId?: string, msgPath?: string): string | undefined => {
          if (msgId) return msgId;
          if (msgPath) return _pathToId.get(msgPath);
          return undefined;
        };

        const settle = (key: string | undefined, action: (p: Pending) => void) => {
          if (!key) return;
          const p = pending.get(key);
          if (p) {
            action(p);
            pending.delete(key);
            _pathToId.delete(p.path);
          }
        };

        switch (msg.type) {
          case "connected":
            break;
          case "stdout": {
            const cb = msg.pty_id != null ? _ptyStdout.get(msg.pty_id) : get().onStdout;
            cb?.(msg.data);
            break;
          }
          case "pty_created": {
            const p = pending.get("create_pty");
            if (p) {
              p.resolve(msg.pty_id);
              pending.delete("create_pty");
            } else {
              set({ _initialPtyId: msg.pty_id as number });
            }
            break;
          }
          case "list_dir_result":
            settle(resolveKey(msg.id, msg.path), (p) => p.resolve(msg.entries));
            break;
          case "read_file_result":
            settle(resolveKey(msg.id, msg.path), (p) => {
              const raw = atob(msg.content_b64);
              const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
              const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
              p.resolve(text);
            });
            break;
          case "write_file_result":
            settle(resolveKey(msg.id, msg.path), (p) => p.resolve(undefined));
            break;
          case "mkdir_result":
            settle(resolveKey(msg.id, msg.path), (p) => p.resolve(undefined));
            break;
          case "rename_result":
            settle(resolveKey(msg.id, msg.old_path || msg.new_path), (p) => p.resolve(undefined));
            break;
          case "error": {
            if (!msg.id && !msg.path) {
              set({ connectionError: msg.message });
            } else {
              const key = resolveKey(msg.id, msg.path) ?? "error";
              settle(key, (p) => p.reject(new Error(msg.message)));
            }
            break;
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      // Only reset if this WS is still the active connection
      if (get().ws === ws) {
        set({ status: "disconnected", ws: null, pending: new Map(), projectPath: null, _initialPtyId: null });
      }
    };

    ws.onerror = () => {
      if (get().ws === ws) {
        set({ status: "disconnected", projectPath: null, connectionError: "WebSocket connection failed", _initialPtyId: null });
      }
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

  createPty: (cwd?: string) =>
    new Promise<number>((resolve) => {
      const state = get();
      const timer = setTimeout(() => {
        state.pending.delete("create_pty");
        resolve(0);
      }, 2000);
      state.pending.set("create_pty", {
        resolve: (v: unknown) => {
          clearTimeout(timer);
          resolve(v as number);
        },
        reject: () => {
          clearTimeout(timer);
          resolve(0);
        },
        path: "",
      } as Pending);
      state.send({ type: "create_pty", cwd });
    }),

  closePty: (ptyId: number) => {
    get()._ptyStdout.delete(ptyId);
    get().send({ type: "close_pty", pty_id: ptyId });
  },

  setOnPtyStdout: (ptyId, cb) =>
    set((s) => {
      const map = new Map(s._ptyStdout);
      if (cb) map.set(ptyId, cb);
      else map.delete(ptyId);
      return { _ptyStdout: map };
    }),

  takeInitialPty: () => {
    const id = get()._initialPtyId;
    if (id !== null) set({ _initialPtyId: null });
    return id;
  },

  listDir: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject, path } as Pending);
      state._pathToId.set(path, id);
      state.send({ type: "list_dir", path, id });
    }),

  readFile: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject, path } as Pending);
      state._pathToId.set(path, id);
      state.send({ type: "read_file", path, id });
    }),

  writeFile: (path: string, content: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject, path } as Pending);
      state._pathToId.set(path, id);
      state.send({ type: "write_file", path, content, id });
    }),

  createDir: (path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject, path } as Pending);
      state._pathToId.set(path, id);
      state.send({ type: "mkdir", path, id });
    }),

  rename: (old_path: string, new_path: string) =>
    new Promise((resolve, reject) => {
      const state = get();
      const id = String(state._nextId);
      set({ _nextId: state._nextId + 1 });
      state.pending.set(id, { resolve, reject, path: old_path } as Pending);
      state._pathToId.set(old_path, id);
      state.send({ type: "rename", old_path, new_path, id });
    }),
}));
