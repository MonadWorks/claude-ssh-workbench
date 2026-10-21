import { useEffect, useState } from "react";
import { api } from "../api";
import { cssVars } from "../motion";
import type { ChangeSet, Directory, FileContent } from "../../shared/types";

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B`
    : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
function diffKind(line: string) {
  if (/^(diff |index |--- |\+\+\+ )/.test(line)) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
}
function statusKind(line: string) {
  const code = line.slice(0, 2);
  if (code === "??" || code.includes("A")) return "add";
  if (code.includes("D")) return "del";
  if (code.trim()) return "mod";
}
/** One span per line so Git output can be tinted without altering its text. */
const Tinted = ({ text, kind }: { text: string; kind: (line: string) => string | undefined }) =>
  <>{text.split("\n").map((line, i) => <span key={i} className={kind(line)}>{line || " "}</span>)}</>;

export function FilePanel({
  cwd,
  onAttach,
}: {
  cwd: string;
  onAttach: (path: string) => void;
}) {
  const [tab, setTab] = useState<"files" | "changes">("files");
  const [directory, setDirectory] = useState<Directory>();
  const [file, setFile] = useState<FileContent>();
  const [changes, setChanges] = useState<ChangeSet>();
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState(cwd),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setPath(cwd);
    setFile(undefined);
  }, [cwd]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const fetch =
      tab === "files"
        ? api<Directory>(`/directory?path=${encodeURIComponent(path)}`).then(
            (d) => {
              if (!cancelled) setDirectory(d);
            },
          )
        : api<ChangeSet>(`/changes?path=${encodeURIComponent(cwd)}`).then(
            (d) => {
              if (!cancelled) setChanges(d);
            },
          );
    fetch
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, cwd, tab, revision]);
  async function openFile(p: string) {
    setLoading(true);
    setError("");
    setFile(undefined);
    try {
      setFile(await api(`/file?path=${encodeURIComponent(p)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <aside className="panel files-panel" aria-label="文件与修改">
      <span className="rail" aria-hidden="true">DATA BANKS</span>
      <span className="panel-index" aria-hidden="true">03</span>
      <div className="panel-scroll">
        <p className="kicker" aria-hidden="true">03 // DATA BANKS</p>
        <div className="actions tabs">
          <button aria-pressed={tab === "files"} onClick={() => setTab("files")}>
            文件
          </button>
          <button
            aria-pressed={tab === "changes"}
            onClick={() => setTab("changes")}
          >
            修改
          </button>
          <button className="refresh" disabled={loading} onClick={() => setRevision((x) => x + 1)}>
            <i aria-hidden="true">↻</i>刷新
          </button>
        </div>
        {loading ? <p role="status" className="scanning">读取中…</p> : null}
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {tab === "files" ? (
          <>
            <p className="path">{directory?.path || path}</p>
            <div className="actions">
              <button
                disabled={!directory?.parent || loading}
                onClick={() => {
                  setPath(directory!.parent!);
                  setFile(undefined);
                }}
              >
                上一级
              </button>
              <button
                onClick={() => {
                  setPath(cwd);
                  setFile(undefined);
                }}
              >
                项目根目录
              </button>
            </div>
            <input
              aria-label="筛选文件"
              placeholder="筛选当前目录"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="file-list">
              {directory?.entries
                .filter((e) =>
                  e.name.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((e, i) => (
                  <button
                    key={e.path}
                    className="file-row"
                    data-dir={e.directory || undefined}
                    style={cssVars({ "--i": Math.min(i, 30) })}
                    disabled={loading}
                    onClick={() => {
                      if (e.directory) {
                        setPath(e.path);
                        setFile(undefined);
                        setFilter("");
                      } else void openFile(e.path);
                    }}
                  >
                    <i className="glyph" aria-hidden="true" />
                    <span>
                      {e.name}
                      {e.directory ? "/" : ""}
                    </span>
                    {!e.directory ? <small>{size(e.size)}</small> : null}
                  </button>
                ))}
            </div>
            {directory?.truncated ? (
              <small>当前目录仅列出前 1000 项。</small>
            ) : null}
            {file ? (
              <section className="file-preview">
                <div className="preview-head">
                  <p className="path">{file.path}</p>
                  <button className="ignite" onClick={() => onAttach(file.path)}>
                    <span>插入终端</span>
                  </button>
                </div>
                <pre>{file.content}</pre>
              </section>
            ) : null}
          </>
        ) : (
          <section className="changes-preview">
            {changes?.available ? (
              <>
                <p>工作区状态（包含其他会话的修改）</p>
                <pre className="git">
                  {changes.status ? <Tinted text={changes.status} kind={statusKind} /> : "没有修改"}
                </pre>
                <p>已跟踪文件的差异；新文件请在文件列表预览。</p>
                <pre className="git">
                  {changes.diff ? <Tinted text={changes.diff} kind={diffKind} /> : "没有可显示的差异"}
                </pre>
                {changes.truncated ? <p>差异过长，显示已截断。</p> : null}
              </>
            ) : (
              <p>{changes?.reason}</p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
