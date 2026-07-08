"use client";

import { useEffect, useRef } from "react";
import { useUiStore } from "@/store/ui-store";
import { useEditorStore } from "@/store/editor-store";
import { useConnectionStore } from "@/store/connection-store";
import { EditorPanel } from "./editor-panel";
import { ExplorerPanel } from "./explorer-panel";
import { TerminalPanel } from "./terminal-panel";
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

export function Dashboard() {
  const projectPath = useConnectionStore((s) => s.projectPath);
  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync scroll position when activeView changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || projectPath === null) return;

    const views = ["explorer", "editor", "terminal"];
    const index = views.indexOf(activeView);
    if (index === -1) return;

    const expectedScrollLeft = index * container.clientWidth;
    if (Math.abs(container.scrollLeft - expectedScrollLeft) > 5) {
      isProgrammaticRef.current = true;
      container.scrollTo({ left: expectedScrollLeft, behavior: "smooth" });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 350);
    }
  }, [activeView, projectPath]);

  // Adjust scroll alignment on resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (!container || projectPath === null) return;
      const views = ["explorer", "editor", "terminal"];
      const index = views.indexOf(activeView);
      if (index !== -1) {
        container.scrollTo({ left: index * container.clientWidth, behavior: "auto" });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeView, projectPath]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || isProgrammaticRef.current) return;

    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width === 0) return;

    const index = Math.round(scrollLeft / width);
    const views = ["explorer", "editor", "terminal"] as const;
    const targetView = views[index];

    if (targetView && targetView !== activeView) {
      setActiveView(targetView);
    }
  };

  // If no project is selected, show the Home selection screen
  if (projectPath === null) {
    return <HomeScreen />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-zinc-100 overflow-hidden">
      {/* Swipeable container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-none bg-black select-none touch-pan-x"
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Left: File Explorer */}
        <div className="w-full h-full shrink-0 snap-start bg-zinc-950/30">
          <ExplorerPanel />
        </div>

        {/* Center: Editor */}
        <div className="w-full h-full shrink-0 snap-start bg-black">
          <EditorPanel />
        </div>

        {/* Right: Terminal */}
        <div className="w-full h-full shrink-0 snap-start bg-zinc-950/30">
          <TerminalPanel />
        </div>
      </div>

      {/* Bottom tab bar */}
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
          onClick={() => setActiveView("terminal")}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
            activeView === "terminal"
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
