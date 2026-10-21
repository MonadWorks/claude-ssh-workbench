import { useRef, useState } from "react";
import { useWorkbench } from "./useWorkbench";
import { SessionSidebar } from "./components/SessionSidebar";
import { TerminalPanel, type TerminalHandle } from "./components/TerminalPanel";
import { FilePanel } from "./components/FilePanel";
export default function App() {
  const w = useWorkbench();
  const terminal = useRef<TerminalHandle>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const s = w.session;
  const project = cwd ?? s?.cwd ?? w.config?.defaultCwd ?? "";
  return <div className="app-shell">
    <header className="app-header">
      <strong>Claude SSH Workbench</strong>
      <span>{w.config?.host}</span>
      {!w.connected ? <span role="status">本机服务连接中…</span> : null}
      <button onClick={() => void w.refresh()} disabled={w.refreshing}>{w.refreshing ? "刷新中…" : "刷新会话列表"}</button>
    </header>
    {w.error ? <div className="error-banner" role="alert">{w.error}<button onClick={() => w.setError("")}>关闭提示</button></div> : null}
    <main className="workspace">
      <SessionSidebar sessions={w.sessions} history={w.history} selected={w.selected} cwd={project}
        onCwd={setCwd} onCreate={() => void w.create(project)}
        onOpen={(id) => { setCwd(null); w.open(id); }}
        onResume={(item) => { setCwd(null); void w.resume(item); }} />
      <div className="session-area">
        {s ? <TerminalPanel key={`${s.id}:${w.revision}`} ref={terminal} sessionId={s.id} />
          : <div className="empty-state"><p role="status">{w.loading ? "正在恢复终端…" : "工作台尚未连接。"}</p>
            {!w.loading ? <button onClick={() => void w.restore()}>重试连接</button> : null}</div>}
      </div>
      {project ? <FilePanel key={s?.id || project} cwd={s?.cwd || project} onAttach={(path) => {
        if (!terminal.current?.paste(path)) w.setError("请等待终端连接后再插入路径。");
      }} /> : null}
    </main>
  </div>;
}
