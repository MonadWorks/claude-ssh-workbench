import { useEffect, useState } from "react";
import { api } from "../api";
import type { ChangeSet, Directory, FileContent } from "../../shared/types";

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
    <aside className="files-panel" aria-label="文件与修改">
      <div className="actions">
        <button aria-pressed={tab === "files"} onClick={() => setTab("files")}>
          文件
        </button>
        <button
          aria-pressed={tab === "changes"}
          onClick={() => setTab("changes")}
        >
          修改
        </button>
        <button disabled={loading} onClick={() => setRevision((x) => x + 1)}>
          刷新
        </button>
      </div>
      {loading ? <p role="status">读取中…</p> : null}
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
              .map((e) => (
                <button
                  key={e.path}
                  className="file-row"
                  disabled={loading}
                  onClick={() => {
                    if (e.directory) {
                      setPath(e.path);
                      setFile(undefined);
                      setFilter("");
                    } else void openFile(e.path);
                  }}
                >
                  {e.directory ? "▸ " : ""}
                  {e.name}
                  {e.directory ? "/" : ""}
                </button>
              ))}
          </div>
          {directory?.truncated ? (
            <small>当前目录仅列出前 1000 项。</small>
          ) : null}
          {file ? (
            <section className="file-preview">
              <p className="path">{file.path}</p>
              <button onClick={() => onAttach(file.path)}>插入终端</button>
              <pre>{file.content}</pre>
            </section>
          ) : null}
        </>
      ) : (
        <section className="changes-preview">
          {changes?.available ? (
            <>
              <p>工作区状态（包含其他会话的修改）</p>
              <pre>{changes.status || "没有修改"}</pre>
              <p>已跟踪文件的差异；新文件请在文件列表预览。</p>
              <pre>{changes.diff || "没有可显示的差异"}</pre>
              {changes.truncated ? <p>差异过长，显示已截断。</p> : null}
            </>
          ) : (
            <p>{changes?.reason}</p>
          )}
        </section>
      )}
    </aside>
  );
}
