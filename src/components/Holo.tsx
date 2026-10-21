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
        <p className="crawl-intro">很久以前，在一台遥远的远端主机上……</p>
        <p className="crawl-logo"><span>CLAUDE</span><span>WORKBENCH</span></p>
        <div className="crawl-stage">
          <div className="crawl-text">
            <p className="crawl-episode">EPISODE IV</p>
            <h3>远 端 觉 醒</h3>
            <p>星际网络动荡不安。一条加密的 SSH 隧道正穿越无数跃点，驶向遥远的远端主机。</p>
            <p>Claude Code 已在那里整装待发。工作台正在恢复终端会话、校准键盘与输入法，并同步舰队的全部航行记录……</p>
            <p>所有指令都将在原生终端中执行。只要本机工作台仍在运转，跃迁中的会话就不会迷失。</p>
            <p className="crawl-sign">愿代码与你同在。</p>
          </div>
        </div>
      </div>
      <div className="crawl-status" role="status">{status}</div>
      {children ? <div className="crawl-actions">{children}</div> : null}
    </div>
  </div>;
}
