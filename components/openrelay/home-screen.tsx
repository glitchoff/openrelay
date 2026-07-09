"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { useUiStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-yellow-500">
      <path d="M3 7.5C3 6.119 4.119 5 5.5 5h3.586a1 1 0 01.707.293L11.5 7H19a2 2 0 012 2v7.5a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16V7.5z" fill="currentColor" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 text-zinc-400">
      <path d="M12 19V5m0 0l-7 7m7-7l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l4-4-4-4M12 19h8" />
    </svg>
  );
}

interface FolderPickerProps {
  onSelect: (path: string) => void;
  onClose: () => void;
}

function FolderPicker({ onSelect, onClose }: FolderPickerProps) {
  const listDir = useConnectionStore((s) => s.listDir);
  const [currentPath, setCurrentPath] = useState("~");
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // URL Bar states
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [inputPath, setInputPath] = useState(currentPath);

  const loadDirs = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    const normalized = path.replace(/\\/g, "/");
    try {
      const entries = await listDir(normalized);
      // Filter for directories only
      const folderNames = entries
        .filter((e) => e.is_dir)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      setDirs(folderNames);
      setCurrentPath(normalized);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || "Failed to load directory");
      setLoading(false);
      throw e;
    }
  }, [listDir]);

  useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  useEffect(() => {
    loadDirs("~").catch(() => {
      // If ~ fails, try root /
      loadDirs("/");
    });
  }, []);

  const goUp = () => {
    const normalized = currentPath.replace(/\\/g, "/");
    let parent = normalized.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
    if (!parent) {
      parent = "/";
    } else if (/^[a-zA-Z]:$/.test(parent)) {
      parent += "/"; // Append trailing slash to Windows drives
    }
    loadDirs(parent);
  };

  const handleFolderClick = (folder: string) => {
    const normalized = currentPath.replace(/\\/g, "/");
    const nextPath = normalized.replace(/\/+$/, "") + "/" + folder;
    loadDirs(nextPath);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanPath = inputPath.trim().replace(/\\/g, "/");
    if (cleanPath) {
      loadDirs(cleanPath)
        .then(() => setIsEditingPath(false))
        .catch(() => setIsEditingPath(false));
    }
  };

  const isWindowsPath = /^[a-zA-Z]:/.test(currentPath);
  const pathParts = currentPath.replace(/\/+$/, "").replace(/\\/g, "/").split("/").filter(Boolean);
  const isAtRoot = currentPath === "/" || /^[a-zA-Z]:\/+$/.test(currentPath);

  return (
    <div className="flex flex-col h-[60vh] max-h-[500px]">
      {/* Path Breadcrumbs / Input */}
      <div className="flex items-center gap-1.5 px-1 py-2 border-b border-zinc-800 shrink-0">
        <button
          onClick={goUp}
          disabled={isAtRoot}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 disabled:pointer-events-none shrink-0"
        >
          <ArrowUpIcon />
        </button>

        {isEditingPath ? (
          <form
            onSubmit={handlePathSubmit}
            className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-0.5 gap-1.5"
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
            <div className="flex items-center gap-1 text-xs font-mono text-zinc-500 overflow-x-auto scrollbar-none py-0.5 pr-1 w-full">
              {!isWindowsPath && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadDirs("/");
                  }}
                  className="hover:text-zinc-300"
                >
                  root
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
                    {(!isWindowsPath || i > 0) && <span className="text-zinc-700">/</span>}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDirs(full);
                      }}
                      className="hover:text-zinc-300 max-w-[100px] truncate"
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

      {/* Directory Contents */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
            <p className="text-xs text-zinc-500 font-mono">Loading folders...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-sm text-red-500 font-mono mb-4">{error}</p>
            <Button size="sm" variant="outline" onClick={() => loadDirs(currentPath)}>Retry</Button>
          </div>
        ) : dirs.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-12 font-mono">No subdirectories found</p>
        ) : (
          <div className="space-y-0.5 pr-2">
            {dirs.map((name) => (
              <button
                key={name}
                onClick={() => handleFolderClick(name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left text-zinc-300 hover:bg-zinc-800/60 active:bg-zinc-850 transition-colors"
              >
                <FolderIcon />
                <span className="flex-1 truncate font-mono text-zinc-300">{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="pt-4 border-t border-zinc-800 flex items-center gap-2 mt-auto shrink-0">
        <span className="text-xs text-zinc-500 font-mono truncate flex-1">
          Path: {currentPath}
        </span>
        <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl">
          Cancel
        </Button>
        <Button
          onClick={() => onSelect(currentPath)}
          disabled={loading || !!error}
          className="bg-orange-500 text-black hover:bg-orange-400 font-semibold rounded-xl"
          size="sm"
        >
          Select Folder
        </Button>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const setProjectPath = useConnectionStore((s) => s.setProjectPath);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Load recent projects
  useEffect(() => {
    const loaded = localStorage.getItem("openrelay:recent_projects");
    if (loaded) {
      try {
        setRecentProjects(JSON.parse(loaded));
      } catch {}
    }
  }, []);

  const saveRecentProjects = (projects: string[]) => {
    setRecentProjects(projects);
    localStorage.setItem("openrelay:recent_projects", JSON.stringify(projects));
  };

  const handleSelectProject = (path: string) => {
    // Add to recents
    const filtered = recentProjects.filter((p) => p !== path);
    const updated = [path, ...filtered].slice(0, 5); // Keep top 5
    saveRecentProjects(updated);
    
    // Open project
    setProjectPath(path);
    setDialogOpen(false);
  };

  const handleDeleteRecent = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const updated = recentProjects.filter((p) => p !== path);
    saveRecentProjects(updated);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-zinc-100 overflow-y-auto safe-area-bottom">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-6 py-12 justify-center gap-6">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-orange-500">🔥</span> OpenRelay
          </h1>
          <p className="text-sm text-zinc-500">
            Connected to bridge &mdash; <span className="font-mono text-zinc-400">{host}:{port}</span>
          </p>
        </div>

        {/* Project Opener Card */}
        <Card className="bg-zinc-900/40 border-zinc-800 rounded-3xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-zinc-200">Start Workspace</CardTitle>
            <CardDescription className="text-xs text-zinc-500">Open a folder on your remote machine to begin editing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger
                render={
                  <Button className="w-full h-14 bg-orange-500 text-black hover:bg-orange-400 font-semibold rounded-2xl gap-2 flex items-center justify-center transition-all">
                    <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span>Open Folder</span>
                  </Button>
                }
              />
              <DialogContent className="bg-zinc-950 border-zinc-850 rounded-3xl max-w-sm sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base text-zinc-200">Choose Project Directory</DialogTitle>
                </DialogHeader>
                <FolderPicker
                  onSelect={handleSelectProject}
                  onClose={() => setDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Direct Terminal Card */}
        <Card className="bg-zinc-900/40 border-zinc-800 rounded-3xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-zinc-200">Direct Terminal</CardTitle>
            <CardDescription className="text-xs text-zinc-500">Open a shell on your remote machine without selecting a project.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                setProjectPath("~");
                setActiveView("terminal");
              }}
              className="w-full h-14 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 font-semibold rounded-2xl gap-2 flex items-center justify-center transition-all border border-zinc-700"
            >
              <TerminalIcon />
              <span>Open Terminal</span>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Projects List */}
        {recentProjects.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
              Recent Directories
            </h2>
            <div className="space-y-1.5">
              {recentProjects.map((path) => (
                <div
                  key={path}
                  onClick={() => setProjectPath(path)}
                  className="group flex items-center justify-between px-4 py-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 hover:bg-zinc-850/40 hover:border-zinc-800 active:bg-zinc-900/80 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderIcon />
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-300 font-mono truncate">{path.split("/").pop() || "/"}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">{path}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteRecent(e, path)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            onClick={disconnect}
            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-xl"
          >
            Disconnect Bridge
          </Button>
        </div>
      </div>
    </div>
  );
}
