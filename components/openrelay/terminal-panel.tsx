"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useConnectionStore } from "@/store/connection-store";
import { useTerminalStore } from "@/store/terminal-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TERM_OPTS = {
  cursorBlink: true,
  cursorStyle: "block" as const,
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
};

export function TerminalPanel() {
  const send = useConnectionStore((s) => s.send);
  const status = useConnectionStore((s) => s.status);
  const createPty = useConnectionStore((s) => s.createPty);
  const closePty = useConnectionStore((s) => s.closePty);
  const setOnPtyStdout = useConnectionStore((s) => s.setOnPtyStdout);
  const takeInitialPty = useConnectionStore((s) => s.takeInitialPty);

  const terminals = useTerminalStore((s) => s.terminals);
  const activeId = useTerminalStore((s) => s.activeTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const setPtyId = useTerminalStore((s) => s.setPtyId);

  const projectPath = useConnectionStore((s) => s.projectPath);
  const creatingRef = useRef<Set<string>>(new Set());

  // Hold one Term instance + mount ref per terminal id
  const instancesRef = useRef<Map<string, {
    term: Terminal;
    fit: FitAddon;
    div: HTMLDivElement;
    ro: ResizeObserver;
    onDataDisposable?: { dispose: () => void };
  }>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Mount/unmount terminal instances into the container
  const mount = useCallback((id: string) => {
    if (instancesRef.current.has(id)) return;
    const div = document.createElement("div");
    div.className = "absolute inset-0";
    div.style.display = id === activeId ? "block" : "none";
    containerRef.current?.appendChild(div);

    const term = new Terminal(TERM_OPTS);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(div);

    const doFit = () => { try { fit.fit(); } catch {} };
    requestAnimationFrame(doFit);
    setTimeout(doFit, 100);

    const ro = new ResizeObserver(doFit);
    // Observe the full ancestor chain for reliable resize detection
    let el = containerRef.current?.parentElement;
    while (el) {
      ro.observe(el);
      el = el.parentElement;
    }
    ro.observe(div);

    instancesRef.current.set(id, { term, fit, div, ro });
    return { term, fit, div };
  }, [activeId]);

  const unmount = useCallback((id: string) => {
    const inst = instancesRef.current.get(id);
    if (!inst) return;
    inst.ro.disconnect();
    inst.term.dispose();
    inst.div.remove();
    instancesRef.current.delete(id);
  }, []);

  // Create PTY for any terminal that doesn't have one yet
  useEffect(() => {
    if (status !== "connected") return;
    for (const t of terminals) {
      if (t.ptyId !== null) continue;
      if (creatingRef.current.has(t.id)) continue;
      creatingRef.current.add(t.id);
      (async () => {
        try {
          let ptyId: number;
          // First terminal uses initial PTY 0 if available
          if (t.id === "term-0") {
            const initial = takeInitialPty();
            if (initial !== null) {
              ptyId = initial;
            } else {
              ptyId = await createPty(projectPath ?? undefined);
            }
          } else {
            ptyId = await createPty(projectPath ?? undefined);
          }
          setPtyId(t.id, ptyId);
        } catch {
          creatingRef.current.delete(t.id);
        }
      })();
    }
  }, [status, terminals, projectPath, createPty, setPtyId, takeInitialPty]);

  // Clean up creating set when terminals are removed
  useEffect(() => {
    const ids = new Set(terminals.map((t) => t.id));
    for (const id of creatingRef.current) {
      if (!ids.has(id)) creatingRef.current.delete(id);
    }
  }, [terminals]);

  // Mount/unmount xterm instances as terminals come and go
  useEffect(() => {
    const ids = new Set(terminals.map((t) => t.id));
    // Unmount removed
    for (const id of instancesRef.current.keys()) {
      if (!ids.has(id)) unmount(id);
    }
    // Mount new
    for (const t of terminals) {
      if (!instancesRef.current.has(t.id)) mount(t.id);
    }
  }, [terminals, mount, unmount]);

  // Show/hide on active change
  useEffect(() => {
    for (const [id, inst] of instancesRef.current) {
      inst.div.style.display = id === activeId ? "block" : "none";
    }
    // Re-fit active terminal after display change
    const active = instancesRef.current.get(activeId);
    if (active) {
      const doFit = () => { try { active.fit.fit(); } catch {} };
      requestAnimationFrame(doFit);
      setTimeout(doFit, 100);
    }
  }, [activeId]);

  // Wire PTY stdout → term.write once ptyId arrives
  useEffect(() => {
    for (const t of terminals) {
      if (t.ptyId === null) continue;
      const inst = instancesRef.current.get(t.id);
      if (!inst) continue;
      setOnPtyStdout(t.ptyId, (data) => {
        const current = instancesRef.current.get(t.id);
        if (current?.term === inst.term) inst.term.write(data);
      });
    }
  }, [terminals, setOnPtyStdout]);

  // Wire term.onData → send (with correct pty_id)
  useEffect(() => {
    for (const t of terminals) {
      if (t.ptyId === null) continue;
      const inst = instancesRef.current.get(t.id);
      if (!inst) continue;
      inst.onDataDisposable?.dispose();
      inst.onDataDisposable = inst.term.onData((data) => {
        send({ type: "stdin", data, pty_id: t.ptyId! });
      });
    }
  }, [terminals, send]);

  // Build toolbar actions using active terminal's ptyId
  const activeTerm = terminals.find((t) => t.id === activeId);
  const activePtyId = activeTerm?.ptyId;

  function sendStdin(data: string) {
    if (activePtyId == null) return;
    send({ type: "stdin", data, pty_id: activePtyId });
  }

  function handleClear() {
    if (activePtyId == null) return;
    sendStdin("\x0c");
    instancesRef.current.get(activeId)?.term.clear();
  }

  async function handleAddTerminal() {
    addTerminal();
    // The new terminal's PTY will be created once its ID is in the store
    // and the connection is alive
  }

  async function handleRemoveTerminal(id: string) {
    const t = terminals.find((x) => x.id === id);
    if (t?.ptyId != null) closePty(t.ptyId);
    unmount(id);
    removeTerminal(id);
  }

  return (
    <div className="flex flex-col h-full" style={{ willChange: "transform", transform: "translateZ(0)" }}>
      {/* Terminal tabs — browser-like */}
      <div className="flex items-center bg-[#0a0a0a] shrink-0 overflow-hidden select-none">
        <div className="flex items-end gap-px overflow-x-auto flex-1 min-w-0">
          {terminals.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTerminal(t.id)}
              className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                t.id === activeId
                  ? "bg-[#121212] text-zinc-200"
                  : "bg-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/40"
              }`}
            >
              <span className={`size-2 rounded-full ${t.ptyId !== null ? "bg-green-600" : "bg-zinc-700"}`} />
              <span className="truncate max-w-24">{t.title}</span>
              {terminals.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTerminal(t.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      handleRemoveTerminal(t.id);
                    }
                  }}
                  className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="size-3">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Terminal switcher popover */}
        <Popover>
          <PopoverTrigger
            render={
              <button className="flex items-center justify-center size-6 shrink-0 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
                  <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            }
          />
          <PopoverContent className="w-56 bg-zinc-950 border border-zinc-800 p-1 rounded-xl shadow-2xl text-zinc-300">
            <div className="px-3 py-1.5 border-b border-zinc-900 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
              Terminals ({terminals.length})
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {terminals.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveTerminal(t.id)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                    t.id === activeId
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`size-2 rounded-full shrink-0 ${t.ptyId !== null ? "bg-green-600" : "bg-zinc-700"}`} />
                    <span className="truncate">{t.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTerminal(t.id);
                    }}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-3">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-900 pt-1">
              <button
                onClick={handleAddTerminal}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
                  <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New Terminal
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={handleAddTerminal}
          className="flex items-center justify-center size-6 shrink-0 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
            <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="h-px bg-zinc-800 shrink-0" />

      {/* Terminal output container — xterm divs are mounted here */}
      <div ref={containerRef} className="flex-1 min-h-0 relative" />

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[#151515] border-t border-zinc-800 overflow-x-auto shrink-0 select-none">
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x1b")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          Esc
        </button>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\t")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          Tab
        </button>
        <span className="w-px h-6 bg-zinc-800 mx-1 shrink-0" />
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x1b[A")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          ↑
        </button>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x1b[B")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          ↓
        </button>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x1b[D")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          ←
        </button>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x1b[C")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          →
        </button>
        <span className="w-px h-6 bg-zinc-800 mx-1 shrink-0" />
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => sendStdin("\x7f")}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          ⌫
        </button>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={handleClear}
          className="flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700 transition-colors select-none touch-none"
        >
          Clear
        </button>
        <div className="flex-1" />
        <span
          className={`size-1.5 rounded-full shrink-0 ${
            status === "connected" ? "bg-green-500" : "bg-zinc-700"
          }`}
        />
      </div>
    </div>
  );
}
