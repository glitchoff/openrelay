"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useCallback, useRef, useState, useEffect } from "react";
import type { OutgoingMsg, IncomingMsg, FileEntry } from "@/lib/types";

interface WsContextValue {
  status: "disconnected" | "connecting" | "connected";
  connect: (host: string, port: number) => void;
  disconnect: () => void;
  send: (msg: OutgoingMsg) => void;
  onStdout: ((data: string) => void) | null;
  setOnStdout: (cb: ((data: string) => void) | null) => void;
  listDir: (path: string) => Promise<FileEntry[]>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  startDir: string;
  setStartDir: (dir: string) => void;
}

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const onStdoutRef = useRef<((data: string) => void) | null>(null);
  const [startDir, setStartDir] = useState("/home");
  const pendingResolvers = useRef<
    Record<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >({});
  const msgId = useRef(0);

  const send = useCallback((msg: OutgoingMsg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback((host: string, port: number) => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");

    const ws = new WebSocket(`ws://${host}:${port}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      ws.send(JSON.stringify({ type: "connect" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: IncomingMsg = JSON.parse(event.data);
        switch (msg.type) {
          case "connected":
            break;
          case "stdout":
            onStdoutRef.current?.(msg.data);
            break;
          case "error": {
            const resolver = pendingResolvers.current["error"];
            if (resolver) {
              resolver.reject(new Error(msg.message));
              delete pendingResolvers.current["error"];
            }
            break;
          }
          case "list_dir_result": {
            const resolver = pendingResolvers.current[msg.path];
            if (resolver) {
              resolver.resolve(msg.entries);
              delete pendingResolvers.current[msg.path];
            }
            break;
          }
          case "read_file_result": {
            const resolver = pendingResolvers.current[msg.path];
            if (resolver) {
              const raw = atob(msg.content_b64);
              const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
              const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
              resolver.resolve(text);
              delete pendingResolvers.current[msg.path];
            }
            break;
          }
          case "write_file_result": {
            const resolver = pendingResolvers.current[msg.path];
            if (resolver) {
              resolver.resolve(undefined);
              delete pendingResolvers.current[msg.path];
            }
            break;
          }
        }
      } catch {
        // raw text not JSON
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
    };

    ws.onerror = () => {
      setStatus("disconnected");
    };
  }, []);

  const disconnect = useCallback(() => {
    send({ type: "disconnect" });
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, [send]);

  const listDir = useCallback(async (path: string): Promise<FileEntry[]> => {
    return new Promise((resolve, reject) => {
      pendingResolvers.current[path] = { resolve, reject } as { resolve: (v: unknown) => void; reject: (e: Error) => void };
      send({ type: "list_dir", path });
    });
  }, [send]);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      pendingResolvers.current[path] = { resolve, reject } as { resolve: (v: unknown) => void; reject: (e: Error) => void };
      send({ type: "read_file", path });
    });
  }, [send]);

  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      pendingResolvers.current[path] = { resolve, reject } as { resolve: (v: unknown) => void; reject: (e: Error) => void };
      send({ type: "write_file", path, content });
    });
  }, [send]);

  const setOnStdout = useCallback((cb: ((data: string) => void) | null) => {
    onStdoutRef.current = cb;
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <WsContext.Provider
      value={{
        status,
        connect,
        disconnect,
        send,
        onStdout: null,
        setOnStdout,
        listDir,
        readFile,
        writeFile,
        startDir,
        setStartDir,
      }}
    >
      {children}
    </WsContext.Provider>
  );
}

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used within WsProvider");
  return ctx;
}
