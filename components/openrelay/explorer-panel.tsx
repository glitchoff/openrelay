import { useEffect, useState, useRef, useCallback } from "react";
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

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-3.5 shrink-0 transition-transform duration-150", expanded && "rotate-90", className)}>
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function CollapseAllIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h8M6 12h12M10 18h4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SectionChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-3 shrink-0 transition-transform duration-150", collapsed ? "-rotate-90" : "")}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Tree node ──

interface DirCache {
  entries: FileEntry[];
  loading: boolean;
}

export function ExplorerPanel() {
  const listDir = useConnectionStore((s) => s.listDir);
  const readFile = useConnectionStore((s) => s.readFile);
  const openFile = useEditorStore((s) => s.openFile);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFile = useEditorStore((s) => s.activeFile);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const closeFile = useEditorStore((s) => s.closeFile);
  const status = useConnectionStore((s) => s.status);
  const projectPath = useConnectionStore((s) => s.projectPath);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const rootPath = projectPath || "~";

  // ── Dir cache ──

  const [dirCache, setDirCache] = useState<Record<string, DirCache>>(() => ({
    [rootPath]: { entries: [], loading: true },
  }));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));

  // Section collapse state
  const [openFilesCollapsed, setOpenFilesCollapsed] = useState(false);

  // Load root on mount / project change
  useEffect(() => {
    let cancelled = false;
    setDirCache((prev) => ({
      ...prev,
      [rootPath]: { entries: prev[rootPath]?.entries ?? [], loading: true },
    }));

    listDir(rootPath)
      .then((result) => {
        if (cancelled) return;
        const sorted = result.sort((a, b) => {
          if (a.is_dir && !b.is_dir) return -1;
          if (!a.is_dir && b.is_dir) return 1;
          return a.name.localeCompare(b.name);
        });
        setDirCache((prev) => ({
          ...prev,
          [rootPath]: { entries: sorted, loading: false },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setDirCache((prev) => ({
          ...prev,
          [rootPath]: { entries: [], loading: false },
        }));
      });

    return () => { cancelled = true; };
  }, [rootPath, listDir]);

  // Expand root by default when project path loads
  useEffect(() => {
    if (rootPath && rootPath !== "~") {
      setExpanded((prev) => {
        if (prev.has(rootPath)) return prev;
        const next = new Set(prev);
        next.add(rootPath);
        return next;
      });
    }
  }, [rootPath]);

  const loadDir = useCallback(async (path: string) => {
    setDirCache((prev) => ({
      ...prev,
      [path]: { entries: prev[path]?.entries ?? [], loading: true },
    }));

    try {
      const result = await listDir(path);
      const sorted = result.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });
      setDirCache((prev) => ({
        ...prev,
        [path]: { entries: sorted, loading: false },
      }));
    } catch {
      setDirCache((prev) => ({
        ...prev,
        [path]: { entries: [], loading: false },
      }));
    }
  }, [listDir]);

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Load lazily
        if (!dirCache[path] || !dirCache[path].entries.length) {
          loadDir(path);
        }
      }
      return next;
    });
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  async function handleFileClick(fullPath: string) {
    try {
      const content = await readFile(fullPath);
      openFile(fullPath, content);

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

  // ── Render tree ──

  function renderTree(path: string, depth: number): React.ReactNode {
    const cache = dirCache[path];
    if (!cache) return null;

    const entries = cache.entries;

    return (
      <div>
        {entries.map((entry) => {
          const fullPath = path.replace(/\/+$/, "") + "/" + entry.name;

          if (entry.is_dir) {
            const childExpanded = expanded.has(fullPath);
            const childCache = dirCache[fullPath];
            const isActive = activeFile === fullPath;

            return (
              <div key={fullPath}>
                <button
                  onClick={() => toggleExpand(fullPath)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-2 py-1 text-sm text-left",
                    "min-h-[34px] touch-pan-y select-none",
                    "hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors",
                    isActive && "bg-orange-500/10 text-orange-400"
                  )}
                  style={{ paddingLeft: `${8 + depth * 16}px` }}
                >
                  <ChevronIcon expanded={childExpanded} className="text-zinc-500" />
                  {entry.is_symlink ? <SymlinkIcon /> : <FolderIcon />}
                  <span className="flex-1 truncate text-zinc-300 text-[13px]">{entry.name}</span>
                </button>

                {childExpanded && childCache && (
                  <div>
                    {childCache.loading && !childCache.entries.length && (
                      <div
                        className="flex items-center gap-2 py-1.5"
                        style={{ paddingLeft: `${28 + depth * 16}px` }}
                      >
                        <div className="size-3 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
                        <span className="text-[11px] text-zinc-600">Loading...</span>
                      </div>
                    )}
                    {!childCache.loading && childCache.entries.length === 0 && (
                      <div
                        className="text-[11px] text-zinc-600 italic py-1"
                        style={{ paddingLeft: `${28 + depth * 16}px` }}
                      >
                        empty
                      </div>
                    )}
                    {childCache.entries.length > 0 && renderTree(fullPath, depth + 1)}
                  </div>
                )}
              </div>
            );
          }

          // File node
          const isActiveFile = activeFile === fullPath;
          return (
            <button
              key={fullPath}
              onClick={() => handleFileClick(fullPath)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1 text-sm text-left",
                "min-h-[34px] touch-pan-y select-none",
                "hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors",
                isActiveFile && "bg-orange-500/10 text-orange-400 border-r-2 border-r-orange-500"
              )}
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              {entry.is_symlink ? <SymlinkIcon /> : <FileIcon />}
              <span className="flex-1 truncate text-zinc-300 text-[13px]">{entry.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const openFilesList = Object.values(openFiles);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 shrink-0 bg-zinc-950/40 gap-2 min-h-[44px]">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={collapseAll}
            title="Collapse All"
            className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <CollapseAllIcon />
          </button>
          <button
            onClick={() => loadDir(rootPath)}
            title="Refresh"
            className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <RefreshIcon />
          </button>
          <span
            className={cn(
              "size-2 rounded-full transition-colors ml-1 shrink-0",
              status === "connected" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-zinc-700"
            )}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent bg-zinc-950/5">
        {/* ── OPEN FILES section ── */}
        <div className="border-b border-zinc-900/50">
          <button
            onClick={() => setOpenFilesCollapsed(!openFilesCollapsed)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-900/60 transition-colors select-none min-h-[32px]"
          >
            <SectionChevron collapsed={openFilesCollapsed} />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Open Files
            </span>
            <span className="text-[10px] text-zinc-600 tabular-nums ml-1">
              {openFilesList.length}
            </span>
          </button>

          {!openFilesCollapsed && (
            <div className="pb-1">
              {openFilesList.length === 0 ? (
                <div className="text-[11px] text-zinc-600 italic px-4 py-2 select-none">
                  No open files
                </div>
              ) : (
                openFilesList.map((file) => {
                  const isActive = activeFile === file.path;
                  return (
                    <div
                      key={file.path}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-3 py-1 min-h-[32px] text-sm text-left",
                        "hover:bg-zinc-800/40 active:bg-zinc-800/60 transition-colors select-none group cursor-pointer",
                        isActive && "bg-zinc-800/30 text-orange-400"
                      )}
                      onClick={() => setActiveFile(file.path)}
                    >
                      <FileIcon />
                      <span className="flex-1 truncate text-[13px] text-zinc-300 min-w-0">
                        {file.path.split("/").pop()}
                      </span>
                      {file.dirty && (
                        <span className="size-1.5 rounded-full bg-yellow-500 shrink-0" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeFile(file.path);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300 transition-all shrink-0"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── PROJECT FILES section ── */}
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 select-none min-h-[32px]">
            <SectionChevron collapsed={false} />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Project Files
            </span>
          </div>

          <div className="pb-2">
            {dirCache[rootPath]?.loading && !dirCache[rootPath]?.entries.length ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="size-4 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
                <span className="text-[12px] text-zinc-500">Loading project...</span>
              </div>
            ) : (
              <div>
                {/* Root folder header */}
                <button
                  onClick={() => toggleExpand(rootPath)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-3 py-1 text-sm text-left",
                    "min-h-[34px] touch-pan-y select-none",
                    "hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors",
                    expanded.has(rootPath) && "bg-zinc-800/20"
                  )}
                >
                  <ChevronIcon expanded={expanded.has(rootPath)} className="text-zinc-500" />
                  <FolderIcon />
                  <span className="flex-1 truncate text-[13px] text-zinc-200 font-medium">
                    {rootPath.split("/").pop() || rootPath}
                  </span>
                </button>

                {expanded.has(rootPath) && renderTree(rootPath, 1)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
