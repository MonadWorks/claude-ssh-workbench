import { useEffect, useState, type ReactNode } from "react";

const GLYPHS = "⌖⟊⟟⏃⌇⍜⊑⏁⋔⍀⎍⟒⋏◢◣◤◥▙▛▜▟";
const scramble = (text: string, fixed: number) => text.slice(0, fixed) +
  Array.from(text.slice(fixed), (c) => (c.trim() ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c)).join("");

/** Text that decrypts itself from alien glyphs whenever it changes. */
export function Decode({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (document.documentElement.dataset.motion === "off") { setShown(text); return; }
    const steps = 16;
    let step = 0;
    setShown(scramble(text, 0));
    const timer = setInterval(() => {
      step++;
      setShown(step >= steps ? text : scramble(text, Math.floor((step / steps) * text.length)));
      if (step >= steps) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [text]);
  return <span className="decode"><span className="sr-only">{text}</span><span aria-hidden="true">{shown}</span></span>;
}

/** Opening crawl shown while a terminal is still crossing the SSH link. */
export function Crawl({ status, exiting, children }: { status: ReactNode; exiting?: boolean; children?: ReactNode }) {
  return <div className={`crawl${exiting ? " exiting" : ""}`}>
    <div className="crawl-body">
      <div className="crawl-sky" aria-hidden="true">
        <p className="crawl-intro">A long time ago, on a remote host far, far away….</p>
        <p className="crawl-logo"><span>CLAUDE</span><span>WORKBENCH</span></p>
        <div className="crawl-stage">
          <div className="crawl-text">
            <p className="crawl-episode">Episode IV</p>
            <h3>THE REMOTE AWAKENS</h3>
            <p>It is a period of network unrest. An encrypted SSH tunnel streaks across countless hops toward a distant remote host.</p>
            <p>There, Claude Code stands ready. The workbench is restoring your terminal session, calibrating keyboard and input methods, and syncing the fleet’s flight logs….</p>
            <p>Every command runs in the native terminal. As long as the local workbench keeps running, no session is lost in hyperspace.</p>
            <p className="crawl-sign">May the code be with you.</p>
          </div>
        </div>
      </div>
      <div className="crawl-status" role="status">{status}</div>
      {children ? <div className="crawl-actions">{children}</div> : null}
    </div>
  </div>;
}
