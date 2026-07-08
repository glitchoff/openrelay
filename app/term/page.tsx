"use client";

import { Suspense, useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

function TermContent() {
  const searchParams = useSearchParams();
  const host = searchParams.get("host") || "127.0.0.1";
  const port = searchParams.get("port") || "8080";

  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.write("\r\n\x1b[31mDisconnected\x1b[0m\r\n");
    }
    setStatus("disconnected");
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus("connecting");
    const url = `ws://${host}:${port}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        const term = termRef.current;
        if (term) {
          term.clear();
          term.write("\x1b[32mConnected to bridge\x1b[0m\r\n");
          term.write("Enter your SSH target (user@host):\r\n");
        }

        ws.send(JSON.stringify({ type: "connect" }));
      };

      ws.onmessage = (event) => {
        const term = termRef.current;
        if (!term) return;

        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "connected":
              term.write(`\x1b[32mBridge ready — opening SSH session to ${msg.host}\x1b[0m\r\n\r\n`);
              break;
            case "stdout":
              term.write(msg.data);
              break;
            case "error":
              term.write(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
              break;
          }
        } catch {
          term.write(event.data);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        const term = termRef.current;
        if (term) {
          term.write("\r\n\x1b[31mConnection closed\x1b[0m\r\n");
        }
        wsRef.current = null;
      };

      ws.onerror = () => {
        setStatus("disconnected");
        const term = termRef.current;
        if (term) {
          term.write(`\r\n\x1b[31mFailed to connect to ${url}\x1b[0m\r\n`);
        }
      };
    } catch (e) {
      setStatus("disconnected");
      const term = termRef.current;
      if (term) {
        term.write(`\r\n\x1b[31mConnection error: ${e}\x1b[0m\r\n`);
      }
    }
  }, [host, port]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 14,
      fontFamily: "monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#f0f0f0",
        cursor: "#f0f0f0",
        selectionBackground: "#3a3a3a",
        black: "#2e2e2e",
        red: "#eb6a6a",
        green: "#9fdb7a",
        yellow: "#ffd76b",
        blue: "#7ab0df",
        magenta: "#c97fd8",
        cyan: "#70d4c8",
        white: "#d4d4d4",
        brightBlack: "#5c5c5c",
        brightRed: "#ff6b6b",
        brightGreen: "#b4f08a",
        brightYellow: "#ffe07a",
        brightBlue: "#8ac4ff",
        brightMagenta: "#d99ae8",
        brightCyan: "#80e8dc",
        brightWhite: "#f0f0f0",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    fitAddonRef.current = fitAddon;

    term.write("OpenDeck Terminal\r\n");
    term.write("────────────────────\r\n\r\n");

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "stdin", data }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          wsRef.current.send(
            JSON.stringify({ type: "resize", rows: dims.rows, cols: dims.cols })
          );
        }
      }
    };
    window.addEventListener("resize", handleResize);

    termRef.current = term;

    return () => {
      window.removeEventListener("resize", handleResize);
      disconnect();
      term.dispose();
    };
  }, [disconnect]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            OpenDeck Terminal
          </span>
          <span
            className={`inline-block size-1.5 rounded-full ${
              status === "connected"
                ? "bg-green-500"
                : status === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-[10px] text-zinc-600 font-mono">
            {status === "connected"
              ? `ws://${host}:${port}`
              : status === "connecting"
                ? "connecting..."
                : "disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "disconnected" ? (
            <button
              onClick={connect}
              className="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}

export default function TermPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    }>
      <TermContent />
    </Suspense>
  );
}
