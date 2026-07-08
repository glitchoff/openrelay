"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const INSTALL_CMD = `bash <(curl -sL https://raw.githubusercontent.com/glitchoff/openrelay/refs/heads/master/scripts/setup.sh)`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      className="absolute right-2 top-2 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function Home() {
  const router = useRouter();
  const [showConnect, setShowConnect] = useState(false);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("8080");

  function handleConnect() {
    router.push(`/dashboard?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`);
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-zinc-100">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md w-full mx-auto flex flex-col items-center gap-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-orange-500">🔥</span> OpenDeck
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Code editor for Android
            </p>
          </div>

          <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3">
              Install bridge in Termux
            </h2>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-black p-3 text-sm text-zinc-300 font-mono leading-relaxed">
                {INSTALL_CMD}
              </pre>
              <CopyButton text={INSTALL_CMD} />
            </div>
            <ol className="mt-4 space-y-2 text-sm text-zinc-500">
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">1.</span>
                <span>Open <span className="font-mono text-zinc-400">Termux</span> on your Android phone</span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">2.</span>
                <span>Paste and run the command above</span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">3.</span>
                <span>Enter your SSH target + password when prompted</span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">4.</span>
                <span>Come back here and connect</span>
              </li>
            </ol>
          </div>

          {!showConnect ? (
            <button
              onClick={() => setShowConnect(true)}
              className="w-full rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-orange-400 active:bg-orange-600"
            >
              Connect to Bridge
            </button>
          ) : (
            <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <h2 className="text-sm font-medium text-zinc-300">
                Bridge Connection
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Host</label>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Port</label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <button
                onClick={handleConnect}
                className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-orange-400 active:bg-orange-600"
              >
                Connect
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-900 px-6 py-3">
        <p className="text-center text-xs text-zinc-700">
          OpenDeck &mdash; MIT License
        </p>
      </div>
    </div>
  );
}
