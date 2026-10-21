import { useCallback, useEffect, useRef, useState } from "react";
import { checkBatch, pathsText, thumbnail, transmit, type Stage } from "./uplink";
import { emit } from "./motion";

const LOG_KEY = "claude-ssh-workbench.uplinks";
const LOG_LIMIT = 24;

export interface UplinkItem { path: string; name: string; thumb: string; at: number; }
export interface UplinkJob {
  id: number;
  count: number;
  thumbs: string[];
  names: string[];
  stage: Stage;
  status: "sending" | "done" | "error";
  error?: string;
  paths?: string[];
  /** Where the paths ended up: typed into the terminal, copied, or neither. */
  delivered?: "inserted" | "copied" | "none";
}

function savedLog(): UplinkItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(items) ? items.slice(0, LOG_LIMIT) : [];
  } catch { return []; }
}
const copy = (text: string) => navigator.clipboard.writeText(text).then(() => true, () => false);

/** File uplink: paste a screenshot into the terminal, drop files on the window, or pick them. */
export function useUplink(sessionId: string | undefined, insert: (text: string) => boolean) {
  const [job, setJob] = useState<UplinkJob | null>(null);
  const [log, setLog] = useState(savedLog);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const last = useRef<File[]>([]);
  const insertRef = useRef(insert);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  insertRef.current = insert;
  useEffect(() => {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* Optional storage. */ }
  }, [log]);

  // A trailing space lets the user keep typing their request; nothing is ever submitted.
  const insertPaths = useCallback((paths: string[]) => insertRef.current(pathsText(paths) + " "), []);
  const copyPaths = useCallback((paths: string[]) => copy(pathsText(paths)), []);

  const send = useCallback(async (files: File[]) => {
    if (busy.current) return;
    const id = Date.now(), targetSession = sessionRef.current;
    const update = (patch: Partial<UplinkJob>) => setJob((j) => (j && j.id === id ? { ...j, ...patch } : j));
    const problem = checkBatch(files);
    last.current = files;
    setJob({ id, count: files.length, names: files.map((f) => f.name), thumbs: [], stage: "connect", status: problem ? "error" : "sending", error: problem });
    if (problem) return;
    busy.current = true;
    const thumbs = Promise.all(files.map((file) => thumbnail(file)));
    void thumbs.then((t) => update({ thumbs: t }));
    try {
      const paths = await transmit(files, (stage) => {
        update({ stage });
        if (stage === "transfer") emit("hyperspace");
      });
      const t = await thumbs;
      setLog((old) => [...paths.map((path, i) => ({ path, name: files[i].name, thumb: t[i], at: Date.now() })),
        ...old.filter((item) => !paths.includes(item.path))].slice(0, LOG_LIMIT));
      const delivered = targetSession && targetSession === sessionRef.current && insertPaths(paths) ? "inserted" : await copyPaths(paths) ? "copied" : "none";
      update({ status: "done", paths, delivered });
    } catch (error) {
      update({ status: "error", error: (error as Error).message });
    } finally {
      busy.current = false;
    }
  }, [insertPaths, copyPaths]);

  useEffect(() => {
    let depth = 0;
    const files = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (files(e)) { e.preventDefault(); depth++; setDragging(true); } };
    const over = (e: DragEvent) => { if (files(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = "copy"; } };
    const leave = (e: DragEvent) => { if (files(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    // Dropping anywhere transmits; it also stops the browser from navigating to the file.
    const drop = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void send(Array.from(e.dataTransfer!.files));
    };
    // Capture phase so a file paste never reaches xterm. Text pastes pass through untouched.
    const paste = (e: ClipboardEvent) => {
      const data = e.clipboardData, target = e.target as HTMLElement | null;
      if (!data || data.getData("text/plain")) return;
      if (target?.closest?.("input, textarea, select, [contenteditable]") && !target.closest(".terminal-host")) return;
      const files = Array.from(data.files);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      void send(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    document.addEventListener("paste", paste, true);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste, true);
    };
  }, [send]);

  const retry = useCallback(() => void send(last.current), [send]);
  const dismiss = useCallback(() => { if (!busy.current) setJob(null); }, []);
  const clear = useCallback(() => setLog([]), []);
  return { job, log, dragging, send, insertPaths, copyPaths, retry, dismiss, clear };
}
