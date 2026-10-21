import { useState } from "react";
import type { HistoryItem, Session } from "../../shared/types";

export const STATUS_LABELS: Record<Session["status"], string> = {
  stopped: "连接已关闭",
  connecting: "正在连接远端 Claude…",
  idle: "终端已连接",
  error: "需要重试",
};
interface Props {
  sessions: Session[];
  history: HistoryItem[];
  selected: string;
  cwd: string;
  onCwd: (cwd: string) => void;
  onOpen: (id: string) => void;
  onResume: (s: HistoryItem) => void;
  onCreate: () => void;
}
export function SessionSidebar(p: Props) {
  const [search, setSearch] = useState("");
  const managed = new Set(p.sessions.map((s) => s.id));
  const matches = (s: { title: string; cwd: string }) =>
    (!p.cwd || s.cwd.toLowerCase() === p.cwd.toLowerCase()) &&
    `${s.title} ${s.cwd}`.toLowerCase().includes(search.toLowerCase());
  const projectPaths = [
    ...new Set([...p.sessions, ...p.history].map((s) => s.cwd)),
  ];
  return (
    <aside className="sessions-panel" aria-label="项目与会话">
      <label>
        项目目录
        <input
          aria-label="项目目录"
          list="projects"
          value={p.cwd}
          onChange={(e) => p.onCwd(e.target.value)}
        />
      </label>
      <datalist id="projects">
        {projectPaths.map((cwd) => (
          <option key={cwd} value={cwd} />
        ))}
      </datalist>
      <button onClick={p.onCreate} disabled={!p.cwd}>
        新建会话
      </button>
      <label>
        筛选会话
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="标题或目录"
        />
      </label>
      <h2>工作台会话</h2>
      {p.sessions
        .filter(matches)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((s) => (
          <button
            className="session-row"
            aria-current={s.id === p.selected ? "true" : undefined}
            key={s.id}
            onClick={() => p.onOpen(s.id)}
            title={s.cwd}
          >
            <span>{s.title}</span>
            <small>
              {STATUS_LABELS[s.status]} ·{" "}
              {new Date(s.updatedAt).toLocaleTimeString()}
            </small>
          </button>
        ))}
      <h2>远端历史</h2>
      {p.history
        .filter((s) => !managed.has(s.id) && matches(s))
        .map((s) => (
          <button
            className="session-row"
            key={s.id}
            onClick={() => p.onResume(s)}
            title={s.cwd}
          >
            <span>{s.title}</span>
            <small>{new Date(s.updatedAt).toLocaleString()}</small>
          </button>
        ))}
      {!p.history.some(matches) && !p.sessions.some(matches) ? (
        <p className="muted">
          这个目录还没有会话。可新建，或选择其他项目目录。
        </p>
      ) : null}
    </aside>
  );
}
