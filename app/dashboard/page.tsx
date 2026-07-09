"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, Suspense } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { Dashboard } from "@/components/opendeck/dashboard";

function DashboardContent() {
  const searchParams = useSearchParams();
  const connect = useConnectionStore((s) => s.connect);
  const status = useConnectionStore((s) => s.status);
  const hasConnected = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

  if (status === "connected") {
    hasConnected.current = true;
    retryDelay.current = 1000; // reset backoff on successful connect
  }

  // Initial connect
  useEffect(() => {
    const host = searchParams.get("host") || "127.0.0.1";
    const port = parseInt(searchParams.get("port") || "8080");
    connect(host, port);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reconnect with exponential backoff when WS drops
  useEffect(() => {
    if (status !== "disconnected" || !hasConnected.current) return;

    const host = searchParams.get("host") || "127.0.0.1";
    const port = parseInt(searchParams.get("port") || "8080");
    const delay = retryDelay.current;

    retryTimer.current = setTimeout(() => {
      retryDelay.current = Math.min(retryDelay.current * 2, 10000);
      connect(host, port);
    }, delay);

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const connectionError = useConnectionStore((s) => s.connectionError);

  // First time: show waiting screen until we connect
  if (!hasConnected.current) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black gap-4 px-6">
        <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
        <p className="text-sm text-zinc-500">
          {status === "connecting" ? "Connecting..." : "Waiting for bridge..."}
        </p>
        {connectionError && (
          <p className="text-xs text-red-500 font-mono mt-2 bg-red-950/20 px-3 py-2 rounded border border-red-900/40 text-center max-w-sm">
            {connectionError}
          </p>
        )}
      </div>
    );
  }

  // Once connected, keep Dashboard mounted — show a small banner on reconnect
  return (
    <>
      <Dashboard />
      {status !== "connected" && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700 backdrop-blur-sm shadow-lg">
          <div className="size-3 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
          <span className="text-xs text-zinc-400">Reconnecting...</span>
        </div>
      )}
    </>
  );
}


export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-black">
          <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
