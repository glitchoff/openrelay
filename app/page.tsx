"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

const INSTALL_CMD = `bash <(curl -sL https://raw.githubusercontent.com/glitchoff/openrelay/refs/heads/master/scripts/setup.sh)`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {}
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
    document.body.removeChild(textArea);
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  function handleTest() {
    setTesting(true);
    setTestResult(null);

    const ws = new WebSocket("ws://127.0.0.1:8080");
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      ws.close();
      setTesting(false);
      setTestResult("fail");
    }, 4000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(JSON.stringify({ type: "connect" }));
      setTimeout(() => {
        ws.close();
        setTesting(false);
        setTestResult("ok");
      }, 300);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setTesting(false);
      setTestResult("fail");
    };
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-zinc-100 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="max-w-md w-full mx-auto flex flex-col items-center gap-6">

          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-orange-500">🔥</span> OpenRelay
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Code editor for Android
            </p>
          </div>

          <Section title="What is this?">
            <p className="text-sm text-zinc-400 leading-relaxed">
              OpenRelay is a remote code editor that runs in your browser. It connects
              to a bridge running in <span className="text-zinc-300 font-mono">Termux</span> on your Android
              phone, which forwards SSH/SFTP to your server. You get a full VS Code‑like
              editor — file tree, terminal, tabs, autosave — without any app install.
            </p>
          </Section>

          <Section title="How it works">
            <ol className="space-y-3 text-sm text-zinc-400">
              <li className="flex gap-3">
                <span className="text-orange-500 font-mono shrink-0 mt-0.5">01</span>
                <span>A <span className="text-zinc-300">Python bridge</span> runs inside Termux on your phone, connecting to your remote server over SSH</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-500 font-mono shrink-0 mt-0.5">02</span>
                <span>The bridge exposes a <span className="text-zinc-300">WebSocket server</span> on port 8080 that this web app talks to</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-500 font-mono shrink-0 mt-0.5">03</span>
                <span>All file operations go through <span className="text-zinc-300">SFTP</span> — list, read, write, delete — no shell commands needed</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-500 font-mono shrink-0 mt-0.5">04</span>
                <span>The <span className="text-zinc-300">interactive terminal</span> runs over a PTY via the bridge, giving you a full shell</span>
              </li>
            </ol>
          </Section>

          <Section title="Features">
            <ul className="space-y-2 text-sm text-zinc-400">
              {[
                ["VS Code‑style editor", "CodeMirror 6 with syntax highlighting, word wrap, search"],
                ["File explorer", "Collapsible tree, lazy loading, open files tabs"],
                ["Built‑in terminal", "Full PTY shell via the bridge"],
                ["Autosave", "Debounced save every 1.5s, toggle on/off"],
                ["Session restore", "Open files persist across reloads"],
                ["Termux", "No app install needed — just a single setup script"],
              ].map(([a, b]) => (
                <li key={a} className="flex gap-3">
                  <span className="text-orange-500 shrink-0 mt-0.5">▸</span>
                  <div>
                    <span className="text-zinc-300">{a}</span>
                    <span className="text-zinc-500"> — {b}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Install bridge in Termux">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-black p-3 text-sm text-zinc-300 font-mono leading-relaxed">
                {INSTALL_CMD}
              </pre>
              <CopyButton text={INSTALL_CMD} />
            </div>
            <p className="mt-3 text-xs text-zinc-600">
              Don&apos;t have Termux? Get it from{" "}
              <a
                href="https://f-droid.org/packages/com.termux/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 underline"
              >
                F‑Droid
              </a>
              {" "}or{" "}
              <a
                href="https://github.com/termux/termux-app/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 underline"
              >
                GitHub releases
              </a>
              .
            </p>
          </Section>

          <div className="w-full flex flex-col items-center gap-3 pt-2">
            {testResult === "ok" && (
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-orange-400"
              >
                Open Dashboard
              </button>
            )}

            <button
              onClick={handleTest}
              disabled={testing}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
                  Testing connection
                </span>
              ) : testResult === "ok" ? (
                "Bridge is running"
              ) : testResult === "fail" ? (
                "Connection failed — retry"
              ) : (
                "Test connection"
              )}
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full rounded-xl border border-zinc-800/40 px-6 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300 hover:bg-zinc-900/30"
            >
              Skip to Dashboard
            </button>
          </div>

        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-900 px-6 py-3 flex items-center justify-center gap-4">
        <a
          href="https://github.com/glitchoff/openrelay"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Fork on GitHub
        </a>
        <span className="text-zinc-800">·</span>
        <p className="text-xs text-zinc-700">OpenRelay &mdash; MIT License</p>
      </div>
    </div>
  );
}
