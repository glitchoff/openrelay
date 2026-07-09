import { useEffect, useState, useRef } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { useEditorStore } from "@/store/editor-store";
import { useUiStore } from "@/store/ui-store";
import type { FileEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-4 shrink-0 text-yellow-500", className)}>
      <path d="M3 7.5C3 6.119 4.119 5 5.5 5h3.586a1 1 0 01.707.293L11.5 7H19a2 2 0 012 2v7.5a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16V7.5z" fill="currentColor" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-4 shrink-0 text-zinc-500", className)}>
      <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" fill="currentColor" opacity="0.3" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SymlinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-4 shrink-0 text-cyan-500", className)}>
      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M11 13l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5">
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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l.57-.57" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
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
  const [refreshCount, setRefreshCount] = useState(0);
  
  // URL Bar & Error recovery States
  const lastValidPathRef = useRef(currentPath);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [inputPath, setInputPath] = useState(currentPath);

  // View Mode States
  const [viewMode, setViewMode] = useState<"list" | "grid" | null>(null);

  useEffect(() => {
    if (projectPath) {
      setCurrentPath(projectPath);
    }
  }, [projectPath]);

  useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  // Load viewMode on client
  useEffect(() => {
    const stored = localStorage.getItem("openrelay:explorer_view_mode");
    setViewMode(stored === "grid" ? "grid" : "list");
  }, []);

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
        lastValidPathRef.current = currentPath; // Save as last successfully loaded path
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err.message || "Failed to load directory");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentPath, listDir, refreshCount]);

  function goUp() {
    let parent = currentPath.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
    if (!parent) {
      parent = "/";
    } else if (/^[a-zA-Z]:$/.test(parent)) {
      parent += "/"; // Append trailing slash to Windows drives
    }
    setCurrentPath(parent);
  }

  function handleRefresh() {
    setRefreshCount((c) => c + 1);
  }

  function handleToggleViewMode() {
    const next = viewMode === "list" ? "grid" : "list";
    setViewMode(next);
    localStorage.setItem("openrelay:explorer_view_mode", next);
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
        const loaded = localStorage.getItem("openrelay:recent_files");
        let recents: string[] = [];
        if (loaded) {
          try { recents = JSON.parse(loaded); } catch {}
        }
        const updated = [fullPath, ...recents.filter((p) => p !== fullPath)].slice(0, 8);
        localStorage.setItem("openrelay:recent_files", JSON.stringify(updated));

        setActiveView("editor");
      } catch {}
    }
  }

  const isWindowsPath = /^[a-zA-Z]:/.test(currentPath);
  const pathParts = currentPath.replace(/\/+$/, "").split("/").filter(Boolean);
  const resolvedViewMode = viewMode || "list";

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header with navigation/URL bar and toggles */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 shrink-0 bg-zinc-950/40 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={goUp}
            className="p-2 rounded-lg hover:bg-zinc-800/80 active:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            title="Go up one level"
          >
            <ArrowLeft />
          </button>
          
          {isEditingPath ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                let cleanPath = inputPath.trim().replace(/\\/g, "/");
                if (cleanPath) {
                  setCurrentPath(cleanPath);
                }
                setIsEditingPath(false);
              }}
              className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 gap-2"
            >
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono py-0.5"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setInputPath(currentPath);
                    setIsEditingPath(false);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setIsEditingPath(false), 200);
                }}
              />
              <button
                type="submit"
                className="text-[10px] bg-orange-500 text-black font-bold px-2 py-0.5 rounded hover:bg-orange-400 active:bg-orange-600 transition-colors"
              >
                Go
              </button>
            </form>
          ) : (
            <div
              onClick={() => setIsEditingPath(true)}
              className="flex-1 flex items-center bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-900 hover:border-zinc-800/60 rounded-lg px-2 py-1 cursor-text min-w-0 transition-all select-none"
              title="Click to edit path"
            >
              <div className="flex items-center gap-1 text-[13px] text-zinc-400 overflow-x-auto scrollbar-none py-0.5 pr-1 w-full">
                {!isWindowsPath && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentPath("/");
                    }}
                    className="hover:text-zinc-200 hover:bg-zinc-800 px-1 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 font-medium"
                  >
                    /
                  </button>
                )}
                {pathParts.map((part, i) => {
                  let full = "";
                  if (isWindowsPath) {
                     const slice = pathParts.slice(0, i + 1);
                     full = slice.join("/");
                     if (slice.length === 1) {
                       full += "/";
                     }
                  } else {
                     full = "/" + pathParts.slice(0, i + 1).join("/");
                  }
                  
                  return (
                    <span key={full} className="flex items-center gap-1 shrink-0">
                      {i > 0 && <span className="text-zinc-700 font-light">/</span>}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPath(full);
                        }}
                        className="hover:text-zinc-200 hover:bg-zinc-800 px-1 py-0.5 rounded transition-colors whitespace-nowrap"
                      >
                        {part}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 pl-1">
          <button
            onClick={handleToggleViewMode}
            title={resolvedViewMode === "list" ? "Switch to Grid View" : "Switch to List View"}
            className="p-2 rounded-lg hover:bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {resolvedViewMode === "list" ? <GridIcon /> : <ListIcon />}
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh Files"
            className="p-2 rounded-lg hover:bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={() => setActiveView("terminal")}
            title="Open Terminal"
            className="p-2 rounded-lg hover:bg-zinc-800/80 text-zinc-500 hover:text-orange-400 transition-colors shrink-0"
          >
            <TerminalIcon />
          </button>
          <span
            className={`size-2 rounded-full transition-colors ml-1 shrink-0 ${
              status === "connected" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-zinc-700"
            }`}
          />
        </div>
      </div>

      {/* Directory Contents Scrollable list/grid */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y scrollbar-thin scrollbar-thumb-zinc-850 scrollbar-track-transparent bg-zinc-950/5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-5 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-5 text-center flex flex-col items-center gap-3">
            <div className="p-2 bg-red-950/20 border border-red-900/40 rounded-xl max-w-[240px]">
              <p className="text-xs text-red-400 font-mono break-all">{error}</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleRefresh}
                className="text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-800 font-medium transition-colors"
              >
                Retry
              </button>
              {lastValidPathRef.current && lastValidPathRef.current !== currentPath && (
                <button
                  onClick={() => {
                    setCurrentPath(lastValidPathRef.current);
                    setError(null);
                  }}
                  className="text-xs bg-orange-500 hover:bg-orange-400 text-black px-3 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  Roll Back Path
                </button>
              )}
            </div>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-sm text-zinc-600 py-12">Empty directory</p>
        ) : resolvedViewMode === "grid" ? (
          <div className="grid grid-cols-3 gap-2.5 p-3.5">
            {entries.map((entry) => (
              <button
                key={entry.name}
                onClick={() => handleEntryClick(entry)}
                className="group flex flex-col items-center justify-between bg-zinc-950/20 hover:bg-zinc-900/60 active:bg-zinc-900 border border-zinc-900/40 hover:border-zinc-800/40 rounded-xl p-3.5 text-center transition-all duration-150 relative cursor-pointer touch-pan-y"
              >
                <div className="flex-1 flex items-center justify-center min-h-[44px] mb-2">
                  {entry.is_symlink ? (
                    <SymlinkIcon className="size-9" />
                  ) : entry.is_dir ? (
                    <FolderIcon className="size-9" />
                  ) : (
                    <FileIcon className="size-9" />
                  )}
                </div>
                <span className="w-full text-xs text-zinc-300 font-medium truncate mb-1" title={entry.name}>
                  {entry.name}
                </span>
                {!entry.is_dir && (
                  <span className="text-[9px] text-zinc-500 tabular-nums bg-zinc-900/60 px-1 py-0.5 rounded border border-zinc-800/20 select-none scale-90">
                    {entry.size < 1024
                      ? `${entry.size} B`
                      : entry.size < 1024 * 1024
                        ? `${(entry.size / 1024).toFixed(0)} KB`
                        : `${(entry.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="py-1.5">
            {entries.map((entry) => (
              <button
                key={entry.name}
                onClick={() => handleEntryClick(entry)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-left hover:bg-zinc-900/60 active:bg-zinc-800/80 transition-all touch-pan-y"
              >
                {entry.is_symlink ? <SymlinkIcon /> : entry.is_dir ? <FolderIcon /> : <FileIcon />}
                <span className="flex-1 truncate text-zinc-300 font-medium">{entry.name}</span>
                {!entry.is_dir && (
                  <span className="text-[10px] text-zinc-500 tabular-nums shrink-0 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800/40">
                    {entry.size < 1024 ? `${entry.size} B` : entry.size < 1024 * 1024 ? `${(entry.size / 1024).toFixed(0)} KB` : `${(entry.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
