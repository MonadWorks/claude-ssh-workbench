import { useEffect, useState } from "react";
import type { UplinkItem, UplinkJob } from "../useUplink";
import { cssVars } from "../motion";

const STEPS = [["connect", "Channel"], ["transfer", "Transmit"], ["verify", "Verify"]] as const;
const SHOWN = 6;
const PASTE_KEY = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘V" : "Ctrl+V";
const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`;
const basename = (p: string) => p.slice(p.lastIndexOf("\\") + 1);

export const UplinkIcon = () => <svg className="uplink-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
  <path d="M12 16.5v-9M8.5 11 12 7.5l3.5 3.5" />
</svg>;

/** Tractor-beam target shown over the viewport while files are dragged in. */
export function DropZone({ host }: { host: string }) {
  return <div className="drop-zone" aria-hidden="true">
    <svg className="drop-rings" viewBox="0 0 200 200">
      <circle className="r1" cx="100" cy="100" r="94" />
      <circle className="r2" cx="100" cy="100" r="76" />
      <circle className="r3" cx="100" cy="100" r="58" />
      <path className="drop-arrow" d="M100 124V76M80 96l20-20 20 20" />
    </svg>
    <p className="drop-title">Release to transmit</p>
    <p className="drop-sub">Images go to <code>ClaudeUploads</code> on {host}; their paths are typed into the terminal.</p>
  </div>;
}

function Elapsed({ running }: { running: boolean }) {
  const [start] = useState(Date.now);
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  const s = Math.floor((now - start) / 1000);
  return <span className="elapsed">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

function statusLine(job: UplinkJob, host: string) {
  if (job.status === "error") return job.error;
  if (job.status === "done") return {
    inserted: "Paths are in the terminal. Add your request, then press Enter.",
    copied: "The terminal isn't ready, so the paths were copied to the clipboard.",
    none: "The terminal isn't ready. Use Copy paths, then paste them into Claude.",
  }[job.delivered || "none"];
  return {
    connect: `Opening an SSH channel to ${host}…`,
    transfer: "Transmitting over SFTP…",
    verify: "Verifying SHA-256 checksums…",
  }[job.stage];
}

function Job({ job, host, onRetry, onInsert, onCopy }: {
  job: UplinkJob; host: string; onRetry: () => void;
  onInsert: (paths: string[]) => boolean; onCopy: (paths: string[]) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const at = job.status === "done" ? STEPS.length : STEPS.findIndex(([key]) => key === job.stage);
  const title = job.status === "done" ? "Verified" : job.status === "sending" ? "Transmitting"
    : job.count ? "Transmission failed" : "Not transmitted";
  const flash = (text: string) => { setNote(text); setTimeout(() => setNote(""), 1600); };
  return <div className="job" data-status={job.status}>
    <div className="job-head">
      <strong>{title}</strong>
      {job.count ? <><span>{plural(job.count)}</span><Elapsed running={job.status === "sending"} /></> : null}
    </div>
    {job.count ? <><div className="thumbs">
      {Array.from({ length: Math.min(job.count, SHOWN) }, (_, i) =>
        <span className="thumb" key={i} style={cssVars({ "--i": i })}>
          {job.thumbs[i] ? <img src={job.thumbs[i]} alt="" /> : null}
        </span>)}
      {job.count > SHOWN ? <span className="thumb more">+{job.count - SHOWN}</span> : null}
    </div>
    <ol className="track">
      {STEPS.map(([key, label], i) => <li key={key}
        data-state={job.status === "error" && i === at ? "failed" : i < at ? "done" : i === at ? "active" : "todo"}>
        <i />{label}
      </li>)}
    </ol></> : null}
    <p className="job-status" role="status">{statusLine(job, host)}</p>
    {job.status === "done" && job.paths ? <div className="job-actions">
      <button onClick={() => flash(onInsert(job.paths!) ? "Inserted" : "Terminal not ready")}>Insert again</button>
      <button onClick={() => void onCopy(job.paths!).then((ok) => flash(ok ? "Copied" : "Copy failed"))}>Copy paths</button>
      {note ? <span className="note">{note}</span> : null}
    </div> : null}
    {job.status === "error" && job.count ? <div className="job-actions">
      <button onClick={onRetry}>Retry</button>
    </div> : null}
  </div>;
}

interface DockProps {
  host: string;
  open: boolean;
  job: UplinkJob | null;
  log: UplinkItem[];
  onClose: () => void;
  onChoose: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onClear: () => void;
  onInsert: (paths: string[]) => boolean;
  onCopy: (paths: string[]) => Promise<boolean>;
}

/** Floating console in the viewport: live transmission plus the manifest of recent uplinks. */
export function UplinkDock(p: DockProps) {
  const [hover, setHover] = useState(false);
  const [note, setNote] = useState<{ path: string; text: string }>();
  // A finished transmission folds away by itself unless the console is pinned open or hovered.
  useEffect(() => {
    if (!p.job || p.job.status === "sending" || p.open || hover) return;
    const timer = setTimeout(p.onDismiss, p.job.status === "done" ? 6500 : 12000);
    return () => clearTimeout(timer);
  }, [p.job, p.open, hover, p.onDismiss]);
  if (!p.open && !p.job) return null;
  const flash = (path: string, text: string) => {
    setNote({ path, text });
    setTimeout(() => setNote((n) => (n?.path === path ? undefined : n)), 1600);
  };
  return <section className="uplink-dock" aria-label="Image uplink"
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}>
    <header className="dock-head">
      <UplinkIcon />
      <span className="dock-title">Image uplink</span>
      <span className="dock-host">→ {p.host}</span>
      {p.open || p.job?.status !== "sending"
        ? <button className="dock-close" aria-label="Close image uplink" onClick={p.onClose}>×</button> : null}
    </header>
    {p.job ? <Job key={p.job.id} job={p.job} host={p.host} onRetry={p.onRetry} onInsert={p.onInsert} onCopy={p.onCopy} /> : null}
    {p.open ? <>
      <button className="bay" onClick={p.onChoose}>
        <span className="bay-glyph"><UplinkIcon /></span>
        <strong>Drop images or choose files</strong>
        <span>Or paste a screenshot into the terminal with {PASTE_KEY}</span>
        <small>PNG · JPEG · GIF · WebP · 20 images × 20 MB max</small>
      </button>
      {p.log.length ? <div className="manifest">
        <div className="manifest-head">
          <span>Recent transmissions</span>
          <span className="count">{p.log.length}</span>
          <button className="link" onClick={p.onClear}>Clear</button>
        </div>
        <ul>
          {p.log.map((item, i) => <li key={item.path} style={cssVars({ "--i": Math.min(i, 12) })}>
            <span className="thumb">{item.thumb ? <img src={item.thumb} alt="" /> : null}</span>
            <span className="m-text">
              <b title={item.name}>{item.name || basename(item.path)}</b>
              <small title={item.path}>{item.path}</small>
            </span>
            <span className="m-side">
              <time>{new Date(item.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time>
              {note?.path === item.path ? <span className="note">{note.text}</span> : <span className="m-actions">
                <button onClick={() => flash(item.path, p.onInsert([item.path]) ? "Inserted" : "Not ready")}>Insert</button>
                <button onClick={() => void p.onCopy([item.path]).then((ok) => flash(item.path, ok ? "Copied" : "Failed"))}>Copy</button>
              </span>}
            </span>
          </li>)}
        </ul>
      </div> : null}
    </> : null}
  </section>;
}
