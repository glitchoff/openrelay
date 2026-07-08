"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useWs } from "@/lib/ws-context";

interface EditorPaneProps {
  filePath: string | null;
  onClose: () => void;
}

function extForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
      return javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "jsx" || ext === "tsx" });
    case "py":
      return python();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
      return json();
    case "md":
    case "mdx":
      return markdown();
    default:
      return undefined;
  }
}

export function EditorPane({ filePath, onClose }: EditorPaneProps) {
  const { readFile, writeFile } = useWs();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setDirty(false);
    readFile(filePath).then((data) => {
      setContent(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [filePath, readFile]);

  useEffect(() => {
    if (!editorRef.current || loading) return;

    const extensions = [
      basicSetup,
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) setDirty(true);
      }),
      EditorView.theme({
        "&": { fontSize: "14px", height: "100%" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { padding: "8px 0" },
        ".cm-gutters": { borderRight: "none", backgroundColor: "transparent" },
      }),
    ];

    const lang = filePath ? extForPath(filePath) : undefined;
    if (lang) extensions.push(lang);

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filePath, loading]);

  const handleSave = useCallback(async () => {
    if (!filePath || !viewRef.current) return;
    setSaving(true);
    try {
      await writeFile(filePath, viewRef.current.state.doc.toString());
      setDirty(false);
    } catch {}
    setSaving(false);
  }, [filePath, writeFile]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-600">Select a file from the explorer</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="size-5 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  const filename = filePath.split("/").pop() || "";

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4">
              <path d="M19 12H5m0 0l6 6m-6-6l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-xs font-medium text-zinc-300 truncate">{filename}</span>
          {dirty && <span className="text-[10px] text-yellow-500 shrink-0">unsaved</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-orange-500 text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-400 active:bg-orange-600 transition-colors shrink-0"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* CodeMirror */}
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
