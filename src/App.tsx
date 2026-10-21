import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "./useWorkbench";
import { SessionSidebar, STATUS_LABELS } from "./components/SessionSidebar";
import { TerminalPanel, type TerminalHandle } from "./components/TerminalPanel";
import { FilePanel } from "./components/FilePanel";
import { Starfield } from "./components/Starfield";
import { Crawl, Decode } from "./components/Holo";
import { DropZone, UplinkDock, UplinkIcon } from "./components/Uplink";
import { cssVars, emit, listen, useMotion } from "./motion";
import { useUplink } from "./useUplink";

const TITLE = "CLAUDE SSH WORKBENCH";
const MAX_TERMINALS = 8; // Mirrors the backend's concurrent terminal cap.

function Stardate() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const day = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return <span className="stardate">
    {now.getFullYear()}.{String(day).padStart(3, "0")}
    <b>{now.toLocaleTimeString("en-GB")}</b>
  </span>;
}

export default function App() {
  const w = useWorkbench();
  const terminal = useRef<TerminalHandle>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [motion, setMotion] = useMotion();
  const s = w.session;
  const project = cwd ?? s?.cwd ?? w.config?.defaultCwd ?? "";
  const live = w.sessions.filter((x) => x.status === "idle" || x.status === "connecting").length;
  const workspace = useRef<HTMLElement>(null);
  const energy = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const uplink = useUplink((text) => terminal.current?.paste(text) ?? false);
  const [dock, setDock] = useState(false);
  const host = w.config?.host || "remote host";
  // Every session switch (or reconnect of the same one) is a jump to lightspeed.
  useEffect(() => { if (w.selected) emit("hyperspace"); }, [w.selected, w.revision]);
  // Keystrokes surge through the viewport's energy border.
  useEffect(() => listen("keystroke", () => {
    if (motion) energy.current?.animate(
      [{ filter: "brightness(2.6) saturate(1.5)" }, { filter: "none" }],
      { duration: 420, easing: "ease-out" });
  }), [motion]);
  // Panels catch a holographic glint that follows the pointer.
  useEffect(() => {
    const el = workspace.current!;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    el.addEventListener("pointermove", move, { passive: true });
    return () => { cancelAnimationFrame(frame); el.removeEventListener("pointermove", move); };
  }, []);
  return <div className="app-shell" data-link={w.connected ? "up" : "down"} data-dragging={uplink.dragging || undefined}>
    <Starfield motion={motion} />
    <div className="cosmos" aria-hidden="true">
      <span className="cosmos-word">REMOTE · HYPERSPACE · TERMINAL · REMOTE · HYPERSPACE · TERMINAL ·</span>
      <i className="planet" />
      <i className="orbit" />
    </div>
    <header className="app-header">
      <div className="brand">
        <span className="kicker" aria-hidden="true">⟊ Hyperspace uplink · Remote bridge</span>
        <strong className="title">
          <span className="sr-only">Claude SSH Workbench</span>
          {Array.from(TITLE, (c, i) => <span key={i} aria-hidden="true" style={cssVars({ "--i": i })}>{c === " " ? " " : c}</span>)}
        </strong>
      </div>
      <dl className="telemetry">
        <div className="pod">
          <dt>Target host</dt>
          <dd><Decode text={w.config?.host || "—"} /></dd>
        </div>
        <div className="pod" data-full={live >= MAX_TERMINALS || undefined}>
          <dt>Terminals</dt>
          <dd>
            <span className="cells" aria-hidden="true">
              {Array.from({ length: MAX_TERMINALS }, (_, i) =>
                <i key={i} className={i < live ? "lit" : undefined} style={cssVars({ "--i": i })} />)}
            </span>
            {live}/{MAX_TERMINALS}
          </dd>
        </div>
        <div className="pod">
          <dt>Stardate</dt>
          <dd><Stardate /></dd>
        </div>
      </dl>
      <span className="beacon" role="status">{w.connected ? "Link online" : "Connecting to local service…"}</span>
      <div className="header-actions">
        <button className="warp-toggle" aria-pressed={motion} onClick={() => setMotion((m) => !m)}
          title="Starfield, hyperspace jumps and ambient animation">
          Warp FX
        </button>
        <button onClick={() => void w.refresh()} disabled={w.refreshing}>{w.refreshing ? "Refreshing…" : "Refresh sessions"}</button>
      </div>
      <i className="saber" aria-hidden="true" />
    </header>
    {w.error ? <div className="error-banner" role="alert">
      <span className="alert-tag" aria-hidden="true">ALERT</span>
      <span className="alert-text">{w.error}</span>
      <button onClick={() => w.setError("")}>Dismiss</button>
    </div> : null}
    <main className="workspace" ref={workspace}>
      <SessionSidebar sessions={w.sessions} history={w.history} selected={w.selected} cwd={project}
        onCwd={setCwd} onCreate={() => void w.create(project)}
        onOpen={(id) => { setCwd(null); w.open(id); }}
        onResume={(item) => { setCwd(null); void w.resume(item); }} />
      <div className="viewport">
        <i className="energy" ref={energy} aria-hidden="true" />
        <div className="viewport-inner">
          <div className="viewport-bar" data-status={s?.status}>
            <i className="blade" aria-hidden="true" />
            <span className="vb-title">{s ? <Decode text={s.title} /> : "NO SIGNAL"}</span>
            {s ? <span className="vb-status">{STATUS_LABELS[s.status]}</span> : null}
            <span className="vb-path" title={s?.cwd}>{s?.cwd}</span>
            <button className="uplink-btn" aria-expanded={dock} data-busy={uplink.job?.status === "sending" || undefined}
              title="Send images to the remote host (or paste / drop them)" onClick={() => setDock((open) => !open)}>
              <UplinkIcon />Uplink
              {uplink.log.length ? <span className="badge">{uplink.log.length}</span> : null}
            </button>
            <input ref={picker} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
              onChange={(e) => { void uplink.send(Array.from(e.target.files || [])); e.target.value = ""; }} />
            <svg className="reticle" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
              <circle cx="12" cy="12" r="1.6" />
            </svg>
          </div>
          <div className="session-area">
            {s ? <TerminalPanel key={`${s.id}:${w.revision}`} ref={terminal} sessionId={s.id} />
              : <div className="empty-state">
                <Crawl status={w.loading ? "Restoring terminal…" : "The workbench is not connected."}>
                  {!w.loading ? <button className="ignite" onClick={() => void w.restore()}><span>Retry</span></button> : null}
                </Crawl>
              </div>}
          </div>
          <UplinkDock host={host} open={dock} job={uplink.job} log={uplink.log}
            onClose={() => { setDock(false); uplink.dismiss(); }} onChoose={() => picker.current?.click()}
            onRetry={uplink.retry} onDismiss={uplink.dismiss} onClear={uplink.clear}
            onInsert={uplink.insertPaths} onCopy={uplink.copyPaths} />
          {uplink.dragging ? <DropZone host={host} /> : null}
        </div>
      </div>
      {project ? <FilePanel key={s?.id || project} cwd={s?.cwd || project} onAttach={(path) => {
        if (!terminal.current?.paste(path)) w.setError("Wait for the terminal to connect before inserting a path.");
      }} /> : null}
    </main>
  </div>;
}
