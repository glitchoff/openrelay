"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useConnectionStore } from "@/store/connection-store";
import { useTerminalStore } from "@/store/terminal-store";
import { KeyboardBar } from "./keyboard-bar";

export function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  const status = useConnectionStore((s) => s.status);
  const send = useConnectionStore((s) => s.send);
  const setOnStdout = useConnectionStore((s) => s.setOnStdout);

  const terminals = useTerminalStore((s) => s.terminals);
  const activeId = useTerminalStore((s) => s.activeTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "monospace",
      allowTransparency: true,
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
    fitRef.current = fitAddon;

    // Fit after mount
    requestAnimationFrame(() => fitAddon.fit());

    term.write("OpenDeck Terminal\r\n────────────────────\r\n\r\n");

    term.onData((data) => {
      send({ type: "stdin", data });
    });

    termRef.current = term;
    setOnStdout((data: string) => term.write(data));

    // ResizeObserver for container sizing
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    if (terminalRef.current.parentElement) {
      ro.observe(terminalRef.current.parentElement);
    }
    resizeObserver.current = ro;

    // Also observe the terminal ref itself
    if (terminalRef.current) {
      ro.observe(terminalRef.current);
    }

    return () => {
      ro.disconnect();
      setOnStdout(null);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [send, setOnStdout]);

  // Re-fit when active terminal changes (tab switch)
  useEffect(() => {
    const ro = resizeObserver.current;
    if (ro && terminalRef.current) {
      requestAnimationFrame(() => {
        try { fitRef.current?.fit(); } catch {}
      });
    }
  }, [activeId]);

  return (
    <div className="flex flex-col h-full">
      {/* Terminal tabs bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-[#121212] border-b border-zinc-800 shrink-0 overflow-x-auto">
        {terminals.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTerminal(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
              t.id === activeId
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            <span className="size-1.5 rounded-full bg-zinc-600" />
            {t.title}
            {terminals.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeTerminal(t.id);
                }}
                className="ml-0.5 hover:text-zinc-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-3">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </button>
        ))}
        <button
          onClick={addTerminal}
          className="flex items-center justify-center size-5 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
            <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Terminal output */}
      <div className="flex-1 min-h-0 relative">
        <div ref={terminalRef} className="absolute inset-0" />
      </div>

      {/* Keyboard toolbar */}
      <KeyboardBar />
    </div>
  );
}
