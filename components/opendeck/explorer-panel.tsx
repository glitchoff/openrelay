"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConnectionStore } from "@/store/connection-store";
import { useEditorStore } from "@/store/editor-store";
import { useUiStore } from "@/store/ui-store";
import type { FileEntry } from "@/lib/types";

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-yellow-500">
      <path d="M3 7.5C3 6.119 4.119 5 5.5 5h3.586a1 1 0 01.707.293L11.5 7H19a2 2 0 012 2v7.5a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16V7.5z" fill="currentColor" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-zinc-500">
      <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" fill="currentColor" opacity="0.3" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SymlinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-cyan-500">
      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M11 13l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M19 12H5m0 0l6 6m-6-6l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l4-4-4-4M12 19h8" />
    </svg>
  );
}

export function ExplorerPanel() {
  const listDir = useConnectionStore((s) => s.listDir);
  const readFile = useConnectionStore((s) => s.readFile);
  const openFile = useEditorStore((s) => s.openFile);
  const status = useConnectionStore((s) => s.status);
  const projectPath = useConnectionStore((s) => s.projectPath);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const [currentPath, setCurrentPath] = useState(projectPath || "~");

  useEffect(() => {
    if (projectPath) {
      setCurrentPath(projectPath);
    }
  }, [projectPath]);

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listDir(currentPath)
      .then((result) => {
        if (cancelled) return;
        const sorted = result.sort((a, b) => {
          if (a.is_dir && !b.is_dir) return -1;
          if (!a.is_dir && b.is_dir) return 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err.message || "Failed to load directory");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentPath, listDir]);

  function goUp() {
    const parent = currentPath.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
    setCurrentPath(parent);
  }

  async function handleEntryClick(entry: FileEntry) {
    const fullPath = currentPath.replace(/\/+$/, "") + "/" + entry.name;
    if (entry.is_dir) {
      setCurrentPath(fullPath);
    } else {
      try {
        const content = await readFile(fullPath);
        openFile(fullPath, content);
        
        // Save to recent files
        const loaded = localStorage.getItem("opendeck:recent_files");
        let recents: string[] = [];
        if (loaded) {
          try { recents = JSON.parse(loaded); } catch {}
        }
        const updated = [fullPath, ...recents.filter((p) => p !== fullPath)].slice(0, 8);
        localStorage.setItem("opendeck:recent_files", JSON.stringify(updated));

        setActiveView("editor");
      } catch {}
    }
  }

  const pathParts = currentPath.replace(/\/+$/, "").split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={goUp}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
          >
            <ArrowLeft />
          </button>
          <div className="flex items-center gap-1 text-xs text-zinc-500 overflow-x-auto scrollbar-none ml-1">
            <button onClick={() => setCurrentPath("/")} className="hover:text-zinc-300 whitespace-nowrap shrink-0">/</button>
            {pathParts.map((part, i) => {
              const full = "/" + pathParts.slice(0, i + 1).join("/");
              return (
                <span key={full} className="flex items-center gap-1">
                  <span className="text-zinc-700">/</span>
                  <button onClick={() => setCurrentPath(full)} className="hover:text-zinc-300 whitespace-nowrap">{part}</button>
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveView("terminal")}
            title="Open Terminal"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-orange-400 transition-colors"
          >
            <TerminalIcon />
          </button>
          <span
            className={`size-1.5 rounded-full transition-colors ${
              status === "connected" ? "bg-green-500" : "bg-zinc-700"
            }`}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-5 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-xs text-red-500 font-mono mb-2 break-all">{error}</p>
            <button
              onClick={() => {
                // Re-trigger load by changing currentPath to itself to re-trigger useEffect
                const p = currentPath;
                setCurrentPath("");
                setTimeout(() => setCurrentPath(p), 10);
              }}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-sm text-zinc-600 py-12">Empty directory</p>
        ) : (
          <div className="py-1">
            {entries.map((entry) => (
              <button
                key={entry.name}
                onClick={() => handleEntryClick(entry)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors"
              >
                {entry.is_symlink ? <SymlinkIcon /> : entry.is_dir ? <FolderIcon /> : <FileIcon />}
                <span className="flex-1 truncate text-zinc-300">{entry.name}</span>
                {!entry.is_dir && (
                  <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
                    {entry.size < 1024 ? `${entry.size} B` : entry.size < 1024 * 1024 ? `${(entry.size / 1024).toFixed(0)} KB` : `${(entry.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
