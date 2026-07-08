"use client";

import { useSearchParams, Suspense } from "next/navigation";
import { useEffect } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { Dashboard } from "@/components/opendeck/dashboard";

function DashboardContent() {
  const searchParams = useSearchParams();
  const connect = useConnectionStore((s) => s.connect);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    const host = searchParams.get("host") || "127.0.0.1";
    const port = parseInt(searchParams.get("port") || "8080");
    if (status === "disconnected") {
      connect(host, port);
    }
  }, []);

  if (status === "disconnected") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black gap-4 px-6">
        <div className="size-6 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
        <p className="text-sm text-zinc-500">Connecting...</p>
      </div>
    );
  }

  return <Dashboard />;
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
