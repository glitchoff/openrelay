"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWs } from "@/lib/ws-context";

export function TerminalTab() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { status, send, setOnStdout } = useWs();

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
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

    term.write("OpenRelay Terminal\r\n");
    term.write("────────────────────\r\n\r\n");
    term.write("Connected\r\n\r\n");

    term.onData((data) => {
      send({ type: "stdin", data });
    });

    termRef.current = term;

    setOnStdout((data: string) => {
      term.write(data);
    });

    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        send({ type: "resize", rows: dims.rows, cols: dims.cols });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      setOnStdout(null);
      term.dispose();
      termRef.current = null;
    };
  }, [send, setOnStdout]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            Terminal
          </span>
          <span
            className={`inline-block size-1.5 rounded-full ${
              status === "connected" ? "bg-green-500" : "bg-red-500"
            }`}
          />
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}
