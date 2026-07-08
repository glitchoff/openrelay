"use client";

import { useUiStore } from "@/store/ui-store";
import { useEditorStore } from "@/store/editor-store";
import { EditorPanel } from "./editor-panel";
import { ExplorerPanel } from "./explorer-panel";
import { TerminalPanel } from "./terminal-panel";

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

export function Dashboard() {
  const openPanels = useUiStore((s) => s.openPanels);
  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const activeFile = useEditorStore((s) => s.activeFile);
  const openFiles = useEditorStore((s) => s.openFiles);

  const explorerOpen = openPanels.includes("explorer");
  const terminalOpen = openPanels.includes("terminal");

  const currentFile = activeFile ? openFiles[activeFile] : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-zinc-100">
      {/* Main content area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Center: Editor (always rendered) */}
        <div className="flex-1 min-w-0">
          <EditorPanel />
        </div>

        {/* Left drawer overlay: Explorer */}
        <div
          className={`absolute inset-y-0 left-0 w-[85vw] max-w-sm bg-zinc-950 border-r border-zinc-800 z-20 shadow-2xl transition-transform duration-200 ease-out ${
            explorerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ExplorerPanel />
        </div>

        {/* Right drawer overlay: Terminal */}
        <div
          className={`absolute inset-y-0 right-0 w-[85vw] max-w-lg bg-zinc-950 border-l border-zinc-800 z-20 shadow-2xl transition-transform duration-200 ease-out ${
            terminalOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <TerminalPanel />
        </div>

        {/* Backdrop when a panel is open */}
        {(explorerOpen || terminalOpen) && (
          <div
            onClick={() => {
              if (explorerOpen) closePanel("explorer");
              if (terminalOpen) closePanel("terminal");
            }}
            className="absolute inset-0 bg-black/50 z-10"
          />
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center justify-around px-2 py-1.5 bg-[#0f0f0f] border-t border-zinc-900 shrink-0 safe-area-bottom">
        <button
          onClick={() => {
            if (activeView === "explorer") {
              closePanel("explorer");
              setActiveView("editor");
            } else {
              openPanel("explorer");
              setActiveView("explorer");
            }
          }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
            explorerOpen || activeView === "explorer"
              ? "text-orange-500"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <FilesIcon />
          <span className="text-[9px] font-medium">Files</span>
        </button>

        <button
          onClick={() => {
            closePanel("explorer");
            closePanel("terminal");
            setActiveView("editor");
          }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
            activeView === "editor" && !explorerOpen && !terminalOpen
              ? "text-orange-500"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <CodeIcon />
          <span className="text-[9px] font-medium">Editor</span>
        </button>

        <button
          onClick={() => {
            if (terminalOpen) {
              closePanel("terminal");
              setActiveView("editor");
            } else {
              openPanel("terminal");
              setActiveView("terminal");
            }
          }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
            terminalOpen || activeView === "terminal"
              ? "text-orange-500"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <TerminalIcon />
          <span className="text-[9px] font-medium">Terminal</span>
        </button>
      </div>
    </div>
  );
}
