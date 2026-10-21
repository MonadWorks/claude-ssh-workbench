import { useState } from "react";
import type { HistoryItem, Session } from "../../shared/types";
import { cssVars } from "../motion";

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
  const fleet = p.sessions
    .filter(matches)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const archive = p.history.filter((s) => !managed.has(s.id) && matches(s));
  return (
    <aside className="panel sessions-panel" aria-label="项目与会话">
      <span className="rail" aria-hidden="true">FLEET COMMAND</span>
      <span className="panel-index" aria-hidden="true">01</span>
      <div className="panel-scroll">
        <p className="kicker" aria-hidden="true">01 // FLEET COMMAND</p>
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
        <button className="ignite" onClick={p.onCreate} disabled={!p.cwd}>
          <span>新建会话</span>
        </button>
        <label className="search">
          筛选会话
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="标题或目录"
          />
        </label>
        <h2>
          <span className="kicker" aria-hidden="true">ACTIVE FLEET</span>
          工作台会话<span className="count">{fleet.length}</span>
        </h2>
        {fleet.map((s, i) => (
          <button
            className="session-row"
            data-status={s.status}
            style={cssVars({ "--i": Math.min(i, 20) })}
            aria-current={s.id === p.selected ? "true" : undefined}
            key={s.id}
            onClick={() => p.onOpen(s.id)}
            title={s.cwd}
          >
            <i className="blade" aria-hidden="true" />
            <span>{s.title}</span>
            <small>
              {STATUS_LABELS[s.status]} ·{" "}
              {new Date(s.updatedAt).toLocaleTimeString()}
            </small>
          </button>
        ))}
        <h2>
          <span className="kicker" aria-hidden="true">ARCHIVES</span>
          远端历史<span className="count">{archive.length}</span>
        </h2>
        {archive.map((s, i) => (
          <button
            className="session-row archive"
            style={cssVars({ "--i": Math.min(i, 20) })}
            key={s.id}
            onClick={() => p.onResume(s)}
            title={s.cwd}
          >
            <i className="blade" aria-hidden="true" />
            <span>{s.title}</span>
            <small>{new Date(s.updatedAt).toLocaleString()}</small>
          </button>
        ))}
        {!p.history.some(matches) && !p.sessions.some(matches) ? (
          <p className="muted void-note">
            这个目录还没有会话。可新建，或选择其他项目目录。
          </p>
        ) : null}
      </div>
    </aside>
  );
}
