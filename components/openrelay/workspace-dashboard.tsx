"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { useEditorStore } from "@/store/editor-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
      <path d="M12 19V5m0 0l-7 7m7-7l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkspaceDashboard() {
  const projectPath = useConnectionStore((s) => s.projectPath);
  const listDir = useConnectionStore((s) => s.listDir);
  const readFile = useConnectionStore((s) => s.readFile);
  const openFile = useEditorStore((s) => s.openFile);
  const openFiles = useEditorStore((s) => s.openFiles);
  const closeFile = useEditorStore((s) => s.closeFile);

  const [currentPath, setCurrentPath] = useState(projectPath || "~");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);

  // Sync current path if project path changes
  useEffect(() => {
    if (projectPath) {
      setCurrentPath(projectPath);
    }
  }, [projectPath]);

  // Load directories and files
  const loadDirContents = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDir(path);
      const sorted = result.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
      setCurrentPath(path);
    } catch (e: any) {
      setError(e.message || "Failed to read directory");
    }
    setLoading(false);
  }, [listDir]);

  useEffect(() => {
    if (currentPath) {
      loadDirContents(currentPath);
    }
  }, [currentPath, loadDirContents]);

  // Load recent files from localStorage
  useEffect(() => {
    const loaded = localStorage.getItem("openrelay:recent_files");
    if (loaded) {
      try {
        setRecentFiles(JSON.parse(loaded));
      } catch {}
    }
  }, []);

  const handleEntryClick = async (entry: FileEntry) => {
    const fullPath = currentPath.replace(/\/+$/, "") + "/" + entry.name;
    if (entry.is_dir) {
      loadDirContents(fullPath);
    } else {
      try {
        const content = await readFile(fullPath);
        openFile(fullPath, content);

        // Add to recent files
        const loaded = localStorage.getItem("openrelay:recent_files");
        let recents: string[] = [];
        if (loaded) {
          try { recents = JSON.parse(loaded); } catch {}
        }
        const updated = [fullPath, ...recents.filter((p) => p !== fullPath)].slice(0, 8);
        localStorage.setItem("openrelay:recent_files", JSON.stringify(updated));
        setRecentFiles(updated);
      } catch (err) {
        console.error("Failed to read file", err);
      }
    }
  };

  const handleRecentClick = async (fullPath: string) => {
    try {
      const content = await readFile(fullPath);
      openFile(fullPath, content);
    } catch {}
  };

  const goUp = () => {
    if (currentPath === projectPath || currentPath === "/") return;
    const parent = currentPath.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
    loadDirContents(parent);
  };

  const pathParts = currentPath.replace(/\/+$/, "").split("/").filter(Boolean);
  const isAtRoot = currentPath === projectPath || currentPath === "/";

  return (
    <div className="h-full bg-black overflow-y-auto px-6 py-8 select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Welcome Section */}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-zinc-100">Welcome to your Workspace</h2>
          <p className="text-xs text-zinc-500 font-mono truncate">Project: {projectPath}</p>
        </div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1 & 2: Built-in File Explorer GUI */}
          <Card className="bg-zinc-900/30 border-zinc-850 md:col-span-2 rounded-2xl flex flex-col h-[400px]">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-zinc-800 shrink-0">
              <div>
                <CardTitle className="text-sm font-semibold text-zinc-200">Project Files</CardTitle>
                <CardDescription className="text-[10px] text-zinc-500">Built-in Directory Browser</CardDescription>
              </div>
              {!isAtRoot && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={goUp}
                  className="rounded-lg h-7 px-2.5 flex items-center gap-1 border-zinc-800"
                >
                  <ArrowUpIcon />
                  <span className="text-[10px]">Up</span>
                </Button>
              )}
            </CardHeader>
            <div className="px-4 py-1.5 border-b border-zinc-900 bg-zinc-950/20 text-[10px] font-mono text-zinc-500 truncate shrink-0">
              {currentPath}
            </div>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <div className="size-5 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
                    <p className="text-[10px] text-zinc-600 font-mono">Loading folder...</p>
                  </div>
                ) : error ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-red-500 font-mono mb-2">{error}</p>
                    <Button size="xs" variant="outline" onClick={() => loadDirContents(currentPath)}>Retry</Button>
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-center text-xs text-zinc-600 py-12 font-mono">Empty directory</p>
                ) : (
                  <div className="divide-y divide-zinc-900/30 py-1">
                    {entries.map((entry) => (
                      <button
                        key={entry.name}
                        onClick={() => handleEntryClick(entry)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-850/40 active:bg-zinc-900 text-xs text-left transition-colors"
                      >
                        {entry.is_dir ? <FolderIcon /> : <FileIcon />}
                        <span className="flex-1 truncate font-mono text-zinc-300">{entry.name}</span>
                        {!entry.is_dir && (
                          <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                            {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(0)} KB`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Column 3: Tab state and Recent Files */}
          <div className="flex flex-col gap-6">
            {/* Active Open Tabs */}
            <Card className="bg-zinc-900/30 border-zinc-850 rounded-2xl flex flex-col h-[188px]">
              <CardHeader className="py-3 px-4 border-b border-zinc-800 shrink-0">
                <CardTitle className="text-sm font-semibold text-zinc-200">Open Tabs</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {Object.keys(openFiles).length === 0 ? (
                    <div className="flex items-center justify-center h-28 text-center px-4">
                      <p className="text-[10px] text-zinc-600 font-mono">No files open in editor</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {Object.values(openFiles).map((file) => (
                        <div
                          key={file.path}
                          onClick={() => useEditorStore.getState().setActiveFile(file.path)}
                          className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-850/40 active:bg-zinc-900 cursor-pointer text-xs transition-colors"
                        >
                          <span className="truncate font-mono text-zinc-300 pr-2">
                            {file.path.split("/").pop()}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.dirty && <span className="size-1.5 rounded-full bg-yellow-500" />}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeFile(file.path);
                              }}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              <svg viewBox="0 0 24 24" fill="none" className="size-3">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recents list */}
            <Card className="bg-zinc-900/30 border-zinc-850 rounded-2xl flex flex-col h-[188px]">
              <CardHeader className="py-3 px-4 border-b border-zinc-800 shrink-0 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-zinc-200">Recent Files</CardTitle>
                {recentFiles.length > 0 && (
                  <button
                    onClick={() => {
                      localStorage.removeItem("openrelay:recent_files");
                      setRecentFiles([]);
                    }}
                    className="text-[9px] text-zinc-500 hover:text-zinc-300 font-medium"
                  >
                    Clear
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {recentFiles.length === 0 ? (
                    <div className="flex items-center justify-center h-28 text-center px-4">
                      <p className="text-[10px] text-zinc-600 font-mono">No recent files</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {recentFiles.map((path) => (
                        <button
                          key={path}
                          onClick={() => handleRecentClick(path)}
                          className="w-full flex flex-col px-4 py-2 hover:bg-zinc-850/40 active:bg-zinc-900 text-left transition-colors min-w-0"
                        >
                          <span className="text-xs truncate font-mono text-zinc-300 w-full">
                            {path.split("/").pop()}
                          </span>
                          <span className="text-[9px] truncate font-mono text-zinc-600 w-full mt-0.5">
                            {path}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
