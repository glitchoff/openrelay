"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConnectionStore } from "@/store/connection-store";
import { useEditorStore, getSavedSession } from "@/store/editor-store";
import { Dashboard } from "@/components/openrelay/dashboard";
import { getProject } from "@/lib/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const connect = useConnectionStore((s) => s.connect);
  const status = useConnectionStore((s) => s.status);
  const connectionError = useConnectionStore((s) => s.connectionError);
  const setProjectPath = useConnectionStore((s) => s.setProjectPath);
  const [project, setProject] = useState(() => getProject(id));
  const [ready, setReady] = useState(false);
  const connectedRef = useRef(false);
  const restoredRef = useRef(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Redirect if project not found
  useEffect(() => {
    if (!project) {
      router.replace("/dashboard");
    }
  }, [project, router]);

  // Connect on mount
  useEffect(() => {
    if (!project) return;
    connect(project.host, project.port, undefined, project.path);
  }, [project?.id]);

  // Once connected, set projectPath and mark ready
  useEffect(() => {
    if (status !== "connected" || connectedRef.current || !project) return;
    connectedRef.current = true;
    setProjectPath(project.path);
    setReady(true);
  }, [status, project]);

  // Restore editor session once
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;

    const session = getSavedSession();
    if (!session || !session.paths.length) return;

    const { readFile } = useConnectionStore.getState();
    const { openFile, setActiveFile } = useEditorStore.getState();

    session.paths.forEach(async (path) => {
      try {
        const content = await readFile(path);
        openFile(path, content);
      } catch {}
    });

    if (session.activeFile) {
      setTimeout(() => setActiveFile(session.activeFile), 100);
    }
  }, [ready]);

  // ── Leave confirmation ──

  // browser-native prompt for tab close / refresh / external nav
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Block swipe-back gestures on mobile while in project
  useEffect(() => {
    if (!ready) return;
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    return () => { document.body.style.overscrollBehavior = prev; };
  }, [ready]);

  // custom dialog for in-app back navigation
  useEffect(() => {
    if (!ready) return;

    // push an extra history entry so popstate fires
    window.history.pushState({ guard: true }, "");

    const handler = (e: PopStateEvent) => {
      // Re-push so the user stays; only proceed if they confirm
      window.history.pushState({ guard: true }, "");
      setLeaveDialogOpen(true);
      pendingNavigationRef.current = () => {
        router.push("/dashboard");
      };
    };

    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      // remove our extra entry
      if (window.history.state?.guard) {
        window.history.back();
      }
    };
  }, [ready, router]);

  function handleConfirmLeave() {
    setLeaveDialogOpen(false);
    pendingNavigationRef.current?.();
    pendingNavigationRef.current = null;
  }

  function handleCancelLeave() {
    setLeaveDialogOpen(false);
    pendingNavigationRef.current = null;
  }

  if (!project) return null;

  // Show connection UI while connecting
  if (!ready) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black gap-4 px-6">
        {!connectionError ? (
          <>
            <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm text-zinc-400 font-medium">{project.name}</p>
              <p className="text-xs text-zinc-600 font-mono">{project.host}:{project.port}</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center max-w-xs">
            <p className="text-xs text-red-500 font-mono bg-red-950/20 px-3 py-2 rounded border border-red-900/40">
              {connectionError}
            </p>
            <button
              onClick={() => { connectedRef.current = false; connect(project.host, project.port); }}
              className="text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg border border-zinc-800 font-medium transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Back to projects
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Dashboard />

      <Dialog open={leaveDialogOpen} onOpenChange={(open) => { if (!open) handleCancelLeave(); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave project?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to leave?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <button
              onClick={handleConfirmLeave}
              className="text-xs px-4 py-2 rounded-xl bg-orange-500 text-black font-semibold hover:bg-orange-400 transition-colors"
            >
              Leave
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
