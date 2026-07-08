"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEditorStore } from "@/store/editor-store";
import { useConnectionStore } from "@/store/connection-store";
import { useUiStore } from "@/store/ui-store";

function extForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": case "ts": case "tsx": case "mjs":
      return javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "jsx" || ext === "tsx" });
    case "py": return python();
    case "html": case "htm": return html();
    case "css": case "scss": case "less": return css();
    case "json": return json();
    case "md": case "mdx": return markdown();
    default: return undefined;
  }
}

export function EditorPanel() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFile = useEditorStore((s) => s.activeFile);
  const setFileContent = useEditorStore((s) => s.setFileContent);
  const markClean = useEditorStore((s) => s.markClean);
  const closeFile = useEditorStore((s) => s.closeFile);

  const writeFile = useConnectionStore((s) => s.writeFile);
  const openPanel = useUiStore((s) => s.openPanel);

  const file = activeFile ? openFiles[activeFile] : null;

  useEffect(() => {
    if (!editorRef.current || !file) return;

    const extensions = [
      basicSetup,
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && file) {
          setFileContent(file.path, update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": { fontSize: "14px", height: "100%" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { padding: "8px 0" },
        ".cm-gutters": { borderRight: "none", backgroundColor: "transparent" },
      }),
    ];

    const lang = extForPath(file.path);
    if (lang) extensions.push(lang);

    const state = EditorState.create({
      doc: file.content,
      extensions,
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [file?.path]);

  // Update content when file changes while editor is mounted
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !file) return;
    const current = view.state.doc.toString();
    if (current !== file.content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: file.content },
      });
    }
  }, [file?.content]);

  const handleSave = useCallback(async () => {
    if (!activeFile) return;
    const f = openFiles[activeFile];
    if (!f) return;
    try {
      await writeFile(activeFile, f.content);
      markClean(activeFile);
    } catch {}
  }, [activeFile, openFiles, writeFile, markClean]);

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <svg viewBox="0 0 24 24" fill="none" className="size-10 text-zinc-700">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm text-zinc-600 text-center">
          Open a file from the<br />
          <button onClick={() => openPanel("explorer")} className="text-orange-500 underline underline-offset-2">
            file explorer
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
        <div className="flex items-center gap-2 min-w-0">
          {openFiles && Object.keys(openFiles).length > 1 && (
            <button
              onClick={() => closeFile(file.path)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-4">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <span className="text-xs font-medium text-zinc-300 truncate">
            {file.path.split("/").pop()}
          </span>
          {file.dirty && <span className="text-[10px] text-yellow-500 shrink-0">unsaved</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!file.dirty}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-orange-500 text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-400 active:bg-orange-600 transition-colors shrink-0"
        >
          Save
        </button>
      </div>

      {/* Tab bar for open files */}
      {Object.keys(openFiles).length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1 bg-[#121212] border-b border-zinc-800 shrink-0 overflow-x-auto">
          {Object.values(openFiles).map((f) => (
            <button
              key={f.path}
              onClick={() => useEditorStore.getState().setActiveFile(f.path)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                f.path === activeFile
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {f.path.split("/").pop()}
              {f.dirty && <span className="text-yellow-500">●</span>}
            </button>
          ))}
        </div>
      )}

      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
