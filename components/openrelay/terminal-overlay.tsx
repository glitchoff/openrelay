"use client";

import { useCallback, useEffect, useRef } from "react";
import { useUiStore } from "@/store/ui-store";
import { TerminalPanel } from "./terminal-panel";

export function TerminalOverlay() {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const translatingRef = useRef(false);

  // Animate via transition — always rendered in DOM so xterm state is preserved
  const close = useCallback(() => setTerminalOpen(false), [setTerminalOpen]);

  // Swipe down to dismiss
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    translatingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!translatingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0 && overlayRef.current) {
      overlayRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!translatingRef.current) return;
    translatingRef.current = false;
    const dy = e.changedTouches[0].clientY - startYRef.current;
    if (overlayRef.current) {
      overlayRef.current.style.transform = "";
    }
    if (dy > 100) close();
  }, [close]);

  // Close on Escape
  useEffect(() => {
    if (!terminalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [terminalOpen, close]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 ${
          terminalOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={overlayRef}
        className={`fixed inset-x-0 bottom-0 z-40 flex flex-col bg-[#0d0d0d] border-t border-zinc-800 rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out will-change-transform ${
          terminalOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "85vh", height: "65vh" }}
      >
        {/* Handle bar */}
        <div
          className="flex items-center justify-center py-2 shrink-0 cursor-pointer touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={close}
        >
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Terminal panel */}
        <div className="flex-1 min-h-0">
          <TerminalPanel />
        </div>
      </div>
    </>
  );
}
