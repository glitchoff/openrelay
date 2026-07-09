"use client";

import { useCallback } from "react";
import { useTabStore, type Tab } from "@/store/tab-store";
import { useEditorStore } from "@/store/editor-store";
import { useTerminalStore } from "@/store/terminal-store";
import { useConnectionStore } from "@/store/connection-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.type === "terminal") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="size-3.5 shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l4-4-4-4M12 19h8" />
      </svg>
    );
  }
  const ext = tab.id.split(".").pop()?.toLowerCase();
  const colors: Record<string, string> = {
    js: "text-yellow-400", jsx: "text-blue-400", ts: "text-blue-400", tsx: "text-blue-400",
    py: "text-yellow-300", html: "text-orange-400", css: "text-pink-400",
    json: "text-yellow-200", md: "text-zinc-400",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`size-3.5 shrink-0 ${colors[ext || ""] || "text-zinc-500"}`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = useTabStore((s) => s.activeTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);

  const closeFile = useEditorStore((s) => s.closeFile);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const closePty = useConnectionStore((s) => s.closePty);
  const terminals = useTerminalStore((s) => s.terminals);

  const handleClose = useCallback((tab: Tab) => {
    if (tab.type === "file") {
      closeFile(tab.id);
    } else {
      const t = terminals.find((x) => x.id === tab.id);
      if (t?.ptyId != null) closePty(t.ptyId);
      removeTerminal(tab.id);
    }
  }, [closeFile, closePty, removeTerminal, terminals]);

  const handleAddTerminal = useCallback(() => {
    addTerminal();
  }, [addTerminal]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-[#0a0a0a] shrink-0 overflow-hidden select-none border-b border-zinc-800">
      <div className="flex items-end gap-px overflow-x-auto flex-1 min-w-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
              tab.id === activeTab
                ? "bg-[#121212] text-zinc-200"
                : "bg-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/40"
            }`}
          >
            <TabIcon tab={tab} />
            <span className="truncate max-w-28">{tab.title}</span>
            {tab.dirty && <span className="size-1.5 rounded-full bg-yellow-500 shrink-0" />}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleClose(tab);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  handleClose(tab);
                }
              }}
              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-3">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        ))}
      </div>

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
            Open Tabs ({tabs.length})
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  tab.id === activeTab
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TabIcon tab={tab} />
                  <span className="truncate">{tab.title}</span>
                  {tab.dirty && <span className="size-1.5 rounded-full bg-yellow-500 shrink-0" />}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(tab);
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
              <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 17l4-4-4-4M12 19h8" />
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
  );
}
