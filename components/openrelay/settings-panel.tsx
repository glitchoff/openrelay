"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  autosave: boolean;
  onAutosaveChange: (v: boolean) => void;
  wrap: boolean;
  onWrapChange: (v: boolean) => void;
}

export function SettingsPanel({ open, onClose, autosave, onAutosaveChange, wrap, onWrapChange }: SettingsPanelProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 touch-none"
          onClick={onClose}
        />
      )}

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-2xl shadow-2xl transition-transform duration-200 ease-out touch-pan-y",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        <div className="px-5 pb-6 pt-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GearIcon />
              <span className="text-sm font-semibold text-zinc-100">Settings</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Editor</span>

            {/* Word wrap toggle */}
            <button
              onClick={() => onWrapChange(!wrap)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 active:bg-zinc-800/80 transition-colors min-h-[44px]"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-zinc-200">Word Wrap</span>
                <span className="text-[10px] text-zinc-500">Wrap long lines to fit the editor</span>
              </div>
              <div className={cn(
                "size-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0",
                wrap ? "bg-orange-500 border-orange-500" : "border-zinc-700 bg-transparent"
              )}>
                {wrap && <CheckIcon />}
              </div>
            </button>

            {/* Autosave toggle */}
            <button
              onClick={() => onAutosaveChange(!autosave)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 active:bg-zinc-800/80 transition-colors min-h-[44px]"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-zinc-200">Auto Save</span>
                <span className="text-[10px] text-zinc-500">Automatically save files on change</span>
              </div>
              <div className={cn(
                "size-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0",
                autosave ? "bg-orange-500 border-orange-500" : "border-zinc-700 bg-transparent"
              )}>
                {autosave && <CheckIcon />}
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
