import { useCallback, useEffect, useRef, useState } from "react";
import { api, post } from "./api";
import type { Bootstrap, HistoryItem, Session } from "../shared/types";
import { chooseSession } from "./sessionSelection";
const SELECTION_KEY = "claude-ssh-workbench.selected-session";
function rememberedSession() {
  try { return localStorage.getItem(SELECTION_KEY); } catch { return null; }
}
export function useWorkbench() {
  const [config, setConfig] = useState<Bootstrap>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedRef = useRef("");
  const restoring = useRef<Promise<void> | null>(null);
  const run = useCallback(async <T>(fn: () => Promise<T>) => {
    try { setError(""); return await fn(); } catch (e) { setError((e as Error).message); }
  }, []);
  const select = useCallback((s: Session) => {
    setSessions((old) => [...old.filter((x) => x.id !== s.id), s]);
    selectedRef.current = s.id;
    setSelected(s.id);
    try { localStorage.setItem(SELECTION_KEY, s.id); } catch { /* Optional storage. */ }
  }, []);
  const restore = useCallback(() => {
    if (restoring.current) return restoring.current;
    setLoading(true);
    const task = run(async () => {
      const data = await api<Bootstrap>("/bootstrap");
      setConfig(data);
      setSessions(data.sessions);
      const s = chooseSession(data.sessions, selectedRef.current || rememberedSession())
        ?? await post<Session>("/sessions", { cwd: data.defaultCwd });
      select(s);
    }).then(() => {}).finally(() => { restoring.current = null; setLoading(false); });
    restoring.current = task;
    return task;
  }, [run, select]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run(async () => {
      const data = await api<{ sessions: HistoryItem[] }>("/history");
      setHistory(data.sessions);
    });
    setRefreshing(false);
  }, [run]);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>, socket: WebSocket;
    void restore();
    void refresh();
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/events`);
      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
        if (!selectedRef.current && !restoring.current) void restore();
      };
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (!disposed && message.type === "sessions") setSessions(message.sessions);
      };
      socket.onclose = () => {
        if (!disposed) { setConnected(false); timer = setTimeout(connect, 2000); }
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); socket?.close(); };
  }, [restore, refresh]);
  const open = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (s) { const same = id === selectedRef.current; select(s); if (same) setRevision((x) => x + 1); }
  };
  const create = (cwd: string) => run(async () => select(await post<Session>("/sessions", { cwd })));
  const resume = (item: HistoryItem) => run(async () => select(await post<Session>("/sessions", {
    cwd: item.cwd, resumeId: item.id, title: item.title,
  })));
  return { config, sessions, history, selected, revision, session: sessions.find((s) => s.id === selected),
    error, setError, connected, loading, restore, refreshing, refresh, open, create, resume };
}
