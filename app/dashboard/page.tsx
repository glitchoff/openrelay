"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnectionStore } from "@/store/connection-store";
import { getProjects, saveProject, deleteProject, generateId, type Project } from "@/lib/projects";
import { FolderPicker } from "@/components/openrelay/home-screen";

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-yellow-500">
      <path d="M3 7.5C3 6.119 4.119 5 5.5 5h3.586a1 1 0 01.707.293L11.5 7H19a2 2 0 012 2v7.5a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16V7.5z" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const connect = useConnectionStore((s) => s.connect);
  const status = useConnectionStore((s) => s.status);
  const connectionError = useConnectionStore((s) => s.connectionError);

  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect("127.0.0.1", 8080);
  }, []);

  function handleFolderSelect(path: string) {
    const project: Project = {
      id: generateId(),
      name: `Project at 127.0.0.1:8080`,
      host: "127.0.0.1",
      port: 8080,
      path,
      createdAt: Date.now(),
    };
    saveProject(project);
    router.push(`/project/${project.id}`);
  }

  function handleProjectClick(project: Project) {
    router.push(`/project/${project.id}`);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteProject(id);
    setProjects(getProjects());
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-zinc-100 overflow-y-auto safe-area-bottom">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-6 py-12 justify-center gap-6">

        <div className="text-center space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-orange-500">🔥</span> OpenRelay
          </h1>
          <p className="text-sm text-zinc-500">Open a folder to start coding</p>
          <p className="text-[10px] text-zinc-600 font-mono">127.0.0.1:8080</p>
        </div>

        {status === "connecting" ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
            <p className="text-xs text-zinc-500 font-mono">Connecting to bridge...</p>
          </div>
        ) : connectionError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-3xl px-5">
            <p className="text-xs text-red-500 font-mono bg-red-950/20 px-3 py-2 rounded border border-red-900/40">
              {connectionError}
            </p>
            <button
              onClick={() => connect("127.0.0.1", 8080)}
              className="text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-1.5 rounded-lg border border-zinc-800 font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-4">
            <FolderPicker
              onSelect={handleFolderSelect}
              onClose={() => {}}
            />
          </div>
        )}

        {projects.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
              Recent
            </h2>
            <div className="space-y-1.5">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleProjectClick(p)}
                  className="group flex items-center justify-between px-4 py-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 hover:bg-zinc-850/40 hover:border-zinc-800 active:bg-zinc-900/80 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderIcon />
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-300 font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">{p.path}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, p.id)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center pt-2">
          <a href="/term" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Standalone Terminal
          </a>
        </div>
      </div>
    </div>
  );
}
