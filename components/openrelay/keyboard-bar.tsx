"use client";

import { useCallback, useState } from "react";
import { useConnectionStore } from "@/store/connection-store";

interface KeyBtnProps {
  label: string;
  active?: boolean;
  onTap: () => void;
}

function KeyBtn({ label, active, onTap }: KeyBtnProps) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
      className={`flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-medium transition-colors select-none touch-none ${
        active
          ? "bg-orange-500 text-black"
          : "bg-zinc-800 text-zinc-300 active:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

export function KeyboardBar() {
  const send = useConnectionStore((s) => s.send);
  const [modCtrl, setModCtrl] = useState(false);
  const [modAlt, setModAlt] = useState(false);

  const sendStdin = useCallback((data: string) => {
    send({ type: "stdin", data });
  }, [send]);

  const handleKey = useCallback((key: string) => {
    if (modCtrl) {
      const code = key.toUpperCase().charCodeAt(0) - 64;
      if (code >= 1 && code <= 26) {
        sendStdin(String.fromCharCode(code));
      }
      setModCtrl(false);
      return;
    }
    if (modAlt) {
      sendStdin("\x1b" + key);
      setModAlt(false);
      return;
    }
    sendStdin(key);
  }, [modCtrl, modAlt, sendStdin]);

  const toggleCtrl = useCallback(() => {
    setModCtrl((c) => !c);
    setModAlt(false);
  }, []);

  const toggleAlt = useCallback(() => {
    setModAlt((a) => !a);
    setModCtrl(false);
  }, []);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[#151515] border-t border-zinc-800 overflow-x-auto shrink-0 select-none">
      {/* Modifiers */}
      <KeyBtn label="Ctrl" active={modCtrl} onTap={toggleCtrl} />
      <KeyBtn label="Alt" active={modAlt} onTap={toggleAlt} />
      <KeyBtn label="Esc" onTap={() => sendStdin("\x1b")} />
      <KeyBtn label="Tab" onTap={() => sendStdin("\t")} />

      <div className="w-px h-6 bg-zinc-800 mx-1 shrink-0" />

      {/* Arrows */}
      <KeyBtn label="↑" onTap={() => sendStdin("\x1b[A")} />
      <KeyBtn label="↓" onTap={() => sendStdin("\x1b[B")} />
      <KeyBtn label="←" onTap={() => sendStdin("\x1b[D")} />
      <KeyBtn label="→" onTap={() => sendStdin("\x1b[C")} />

      <div className="w-px h-6 bg-zinc-800 mx-1 shrink-0" />

      {/* Actions */}
      <KeyBtn label="C" onTap={() => handleKey("c")} />
      <KeyBtn label="V" onTap={() => handleKey("v")} />
      <KeyBtn label="X" onTap={() => handleKey("x")} />
      <KeyBtn label="Z" onTap={() => handleKey("z")} />

      <div className="flex-1" />

      {/* Close keyboard */}
      <button
        onPointerDown={(e) => e.preventDefault()}
        className="flex items-center justify-center size-8 rounded-md text-zinc-500 hover:text-zinc-300"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-4">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
