"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkspaceDashboard } from "./workspace-dashboard";

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
    return <WorkspaceDashboard />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <Popover>
            <PopoverTrigger
              render={
                <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-850 text-zinc-300 font-medium text-xs max-w-[200px] truncate transition-colors select-none cursor-pointer">
                  <span className="truncate">{file.path.split("/").pop()}</span>
                  <svg viewBox="0 0 24 24" fill="none" className="size-3 text-zinc-500 shrink-0">
                    <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              }
            />
            <PopoverContent className="w-64 bg-zinc-950 border border-zinc-850 p-1 rounded-xl shadow-2xl text-zinc-300">
              <div className="px-3 py-1.5 border-b border-zinc-900/60 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                Open Files ({Object.keys(openFiles).length})
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {Object.values(openFiles).map((f) => (
                  <div
                    key={f.path}
                    onClick={() => {
                      useEditorStore.getState().setActiveFile(f.path);
                    }}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer select-none ${
                      f.path === activeFile
                        ? "bg-zinc-850 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    <span className="flex-1 truncate pr-2 font-mono">
                      {f.path.split("/").pop()}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.dirty && <span className="size-1.5 rounded-full bg-yellow-500" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeFile(f.path);
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
            </PopoverContent>
          </Popover>

          {file.dirty && <span className="size-1.5 rounded-full bg-yellow-500 shrink-0" />}
        </div>
        
        <button
          onClick={handleSave}
          disabled={!file.dirty}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-500 text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-400 active:bg-orange-600 transition-colors shrink-0"
        >
          Save
        </button>
      </div>

      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
