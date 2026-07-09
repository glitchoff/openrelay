"use client";

import { useCallback } from "react";
import { useTerminalStore, type TerminalSession } from "@/store/terminal-store";
import { useConnectionStore } from "@/store/connection-store";

function TermCard({
  term,
  isActive,
  onSelect,
  onClose,
}: {
  term: TerminalSession;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex flex-col rounded-2xl border overflow-hidden transition-all text-left ${
        isActive
          ? "border-orange-500 bg-zinc-900 shadow-lg shadow-orange-500/10"
          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
      }`}
      style={{ aspectRatio: "4/3" }}
    >
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-1.5 right-1.5 z-10 size-6 rounded-full bg-zinc-900/80 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Preview area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2">
        <svg viewBox="0 0 24 24" fill="none" className="size-10 text-zinc-700" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17l4-4-4-4M12 19h8" />
        </svg>
        <span className={`text-[10px] font-mono ${term.ptyId !== null ? "text-green-600" : "text-zinc-700"}`}>
          {term.ptyId !== null ? "● Connected" : "○ Disconnected"}
        </span>
      </div>

      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30">
        <span className={`size-2 rounded-full shrink-0 ${term.ptyId !== null ? "bg-green-600" : "bg-zinc-700"}`} />
        <span className="text-xs font-medium text-zinc-300 truncate">{term.title}</span>
      </div>
    </button>
  );
}

export function TabSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminal = useTerminalStore((s) => s.activeTerminal);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const closePty = useConnectionStore((s) => s.closePty);
  const addTerminal = useTerminalStore((s) => s.addTerminal);

  const handleSelect = useCallback((id: string) => {
    setActiveTerminal(id);
    onClose();
  }, [setActiveTerminal, onClose]);

  const handleClose = useCallback((term: TerminalSession) => {
    if (term.ptyId != null) closePty(term.ptyId);
    removeTerminal(term.id);
  }, [closePty, removeTerminal]);

  const handleAddTerminal = useCallback(() => {
    addTerminal();
    onClose();
  }, [addTerminal, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 shrink-0">
        <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          Done
        </button>
        <span className="text-sm font-semibold text-zinc-300">
          {terminals.length} {terminals.length === 1 ? "terminal" : "terminals"}
        </span>
        <button
          onClick={handleAddTerminal}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-sm font-medium transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-4">
            <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {terminals.map((term) => (
            <TermCard
              key={term.id}
              term={term}
              isActive={term.id === activeTerminal}
              onSelect={() => handleSelect(term.id)}
              onClose={() => handleClose(term)}
            />
          ))}
        </div>
        {terminals.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
            <svg viewBox="0 0 24 24" fill="none" className="size-12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l4-4-4-4M12 19h8" />
            </svg>
            <p className="text-sm">No terminals</p>
            <button
              onClick={handleAddTerminal}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors"
            >
              Open a Terminal
            </button>
          </div>
        )}
      </div>

      {/* Bottom safe area */}
      <div className="h-safe-bottom bg-black" />
    </div>
  );
}
