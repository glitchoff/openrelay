"use client";

import { useEffect, useState, useRef } from "react";
import { useUiStore } from "@/store/ui-store";
import { useConnectionStore } from "@/store/connection-store";
import { EditorPanel } from "./editor-panel";
import { ExplorerPanel } from "./explorer-panel";
import { TerminalPanel } from "./terminal-panel";
import { TerminalOverlay } from "./terminal-overlay";
import { HomeScreen } from "./home-screen";

function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5">
      <path d="M3 7.5C3 6.119 4.119 5 5.5 5h3.586a1 1 0 01.707.293L11.5 7H19a2 2 0 012 2v7.5a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16V7.5z" fill="currentColor" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15l-2-2 2-2M15 15l2-2-2-2M13 13l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5">
      <path d="M4 17l4-4-4-4M12 19h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6v12a3 3 0 11-3-3h0a3 3 0 01-3-3V6a3 3 0 116 0zM6 4h0M18 4h0" />
    </svg>
  );
}

export function Dashboard() {
  const projectPath = useConnectionStore((s) => s.projectPath);
  const status = useConnectionStore((s) => s.status);
  const reconnect = useConnectionStore((s) => s.reconnect);
  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // If no project is selected, show the Home selection screen
  if (projectPath === null) {
    return <HomeScreen />;
  }

  const disconnected = status !== "connected" && projectPath !== null;

  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="size-6 rounded-full border-2 border-zinc-800 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="fixed inset-0 flex flex-col bg-black text-zinc-100 overflow-hidden" style={{ willChange: "transform", transform: "translateZ(0)" }}>
        {/* Active view — always mounted, hidden with CSS to preserve state */}
        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 ${activeView === "explorer" ? "z-10" : "z-0 invisible"}`}>
            <ExplorerPanel />
          </div>
          <div className={`absolute inset-0 ${activeView === "editor" ? "z-10" : "z-0 invisible"}`}>
            <EditorPanel />
          </div>
        </div>

        {/* Bottom dock */}
        <div className="flex items-center justify-around px-2 py-1.5 bg-[#0f0f0f] border-t border-zinc-900 shrink-0 safe-area-bottom">
          <button
            onClick={() => setActiveView("explorer")}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
              activeView === "explorer"
                ? "text-orange-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <FilesIcon />
            <span className="text-[9px] font-medium">Files</span>
          </button>

          <button
            onClick={() => setActiveView("editor")}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
              activeView === "editor"
                ? "text-orange-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <CodeIcon />
            <span className="text-[9px] font-medium">Editor</span>
          </button>

          <button
            onClick={() => setCommandOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
              commandOpen ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <CommandIcon />
            <span className="text-[9px] font-medium">Commands</span>
          </button>

          <button
            onClick={() => setTerminalOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
              terminalOpen
                ? "text-orange-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <TerminalIcon />
            <span className="text-[9px] font-medium">Terminal</span>
          </button>
        </div>

        {/* Terminal overlay — floats above everything */}
        <TerminalOverlay />

        {/* Command palette */}
        {commandOpen && (
          <CommandPalette onClose={() => setCommandOpen(false)} />
        )}
      </div>
    );
  }

  // Desktop splits layout
  return (
    <div className="fixed inset-0 flex bg-black text-zinc-100 overflow-hidden divide-x divide-zinc-900" style={{ willChange: "transform", transform: "translateZ(0)" }}>
      {/* Left sidebar: File Explorer */}
      <div className="w-72 shrink-0 h-full flex flex-col bg-zinc-950/20">
        <ExplorerPanel />
      </div>

      {/* Main split: Editor + optional terminal drawer */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Editor toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border-b border-zinc-900 shrink-0">
          <div className="flex-1" />
          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              terminalOpen
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l4-4-4-4M12 19h8" />
            </svg>
            Terminal
          </button>
        </div>

        {disconnected && (
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-300">
            <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="flex-1">Connection lost</span>
            <button
              onClick={() => reconnect()}
              className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800/60 text-red-200 transition-colors font-medium"
            >
              Reconnect
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <EditorPanel />
        </div>

        {terminalOpen && (
          <div className="h-80 shrink-0 bg-zinc-950/20 border-t border-zinc-900 relative">
            <TerminalPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function getSettings() {
  let wrap = true, autosave = false;
  try { wrap = localStorage.getItem("openrelay:wrap") !== "false"; } catch {}
  try { autosave = localStorage.getItem("openrelay:autosave") === "true"; } catch {}
  return { wrap, autosave };
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(getSettings);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const commands = [
    { id: "open-file", label: "Open File", shortcut: "Ctrl+P", badge: null as string | null },
    { id: "toggle-wrap", label: "Toggle Word Wrap", shortcut: "", badge: settings.wrap ? "ON" : "OFF" },
    { id: "toggle-autosave", label: "Toggle Auto Save", shortcut: "", badge: settings.autosave ? "ON" : "OFF" },
    { id: "go-terminal", label: "Focus Terminal", shortcut: "Ctrl+`", badge: null },
    { id: "go-explorer", label: "Focus Explorer", shortcut: "Ctrl+B", badge: null },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  function handleSelect(id: string) {
    const setActiveView = useUiStore.getState().setActiveView;
    const setTerminalOpen = useUiStore.getState().setTerminalOpen;
    switch (id) {
      case "go-terminal": setTerminalOpen(true); break;
      case "go-explorer": setActiveView("explorer"); break;
      case "toggle-wrap": {
        const v = !getSettings().wrap;
        try { localStorage.setItem("openrelay:wrap", String(v)); } catch {}
        setSettings(getSettings());
        return; // don't close
      }
      case "toggle-autosave": {
        const v = !getSettings().autosave;
        try { localStorage.setItem("openrelay:autosave", String(v)); } catch {}
        setSettings(getSettings());
        return; // don't close
      }
      case "open-file": break;
    }
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/4 -translate-x-1/2 z-50 w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <svg viewBox="0 0 24 24" fill="none" className="size-4 text-zinc-500 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => handleSelect(cmd.id)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              <span>{cmd.label}</span>
              {cmd.badge !== null ? (
                <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${cmd.badge === "ON" ? "text-green-500 bg-green-950/30" : "text-zinc-600 bg-zinc-900"}`}>
                  {cmd.badge}
                </span>
              ) : cmd.shortcut ? (
                <span className="text-[10px] text-zinc-600 font-mono">{cmd.shortcut}</span>
              ) : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-xs text-zinc-600 py-6">No commands match</p>
          )}
        </div>
      </div>
    </>
  );
}
