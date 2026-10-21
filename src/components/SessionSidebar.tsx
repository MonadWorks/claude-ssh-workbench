import { useState } from "react";
import type { HistoryItem, Session } from "../../shared/types";
import { cssVars } from "../motion";

export const STATUS_LABELS: Record<Session["status"], string> = {
  stopped: "Disconnected",
  connecting: "Connecting to remote Claude…",
  idle: "Terminal online",
  error: "Needs retry",
};
interface Props {
  sessions: Session[];
  history: HistoryItem[];
  historyError: string;
  refreshing: boolean;
  onRefresh: () => void;
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
    <aside className="panel sessions-panel" aria-label="Projects and sessions">
      <span className="rail" aria-hidden="true">FLEET COMMAND</span>
      <span className="panel-index" aria-hidden="true">01</span>
      <div className="panel-scroll">
        <p className="kicker" aria-hidden="true">01 // FLEET COMMAND</p>
        <label>
          Project directory
          <input
            aria-label="Project directory"
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
          <span>New session</span>
        </button>
        <label className="search">
          Filter sessions
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or path"
          />
        </label>
        <h2>
          <span className="kicker" aria-hidden="true">ACTIVE FLEET</span>
          Sessions<span className="count">{fleet.length}</span>
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
              {new Date(s.updatedAt).toLocaleTimeString("en-GB")}
            </small>
          </button>
        ))}
        <h2>
          <span className="kicker" aria-hidden="true">ARCHIVES</span>
          Remote history<span className="count">{archive.length}</span>
        </h2>
        {p.historyError ? <div className="history-notice" role="status">
          <p>Couldn’t refresh remote history. This list may be out of date. You can keep using a connected terminal.</p>
          <button onClick={p.onRefresh} disabled={p.refreshing}>
            {p.refreshing ? "Refreshing…" : "Retry history"}
          </button>
          <details>
            <summary>Error details</summary>
            <p>{p.historyError}</p>
          </details>
        </div> : null}
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
            <small>{new Date(s.updatedAt).toLocaleString("en-GB")}</small>
          </button>
        ))}
        {!p.historyError && !p.refreshing && !p.history.some(matches) && !p.sessions.some(matches) ? (
          <p className="muted void-note">
            No sessions in this directory yet. Start one, or choose another project directory.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
