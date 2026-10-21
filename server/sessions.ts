import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CWD, STATE_DIR } from "./config.ts";
import type { HistoryItem, Session } from "../shared/types.ts";

export const changes = new EventEmitter();
export const sessions = new Map<string, Session>();
const file = path.join(STATE_DIR, "sessions.json");
mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
if (existsSync(file)) {
  for (const s of JSON.parse(readFileSync(file, "utf8"))) {
    sessions.set(s.id, { id: s.id, title: s.title, cwd: s.cwd,
      persisted: Boolean(s.persisted), updatedAt: s.updatedAt, status: "stopped" });
  }
}
function save() {
  const records = [...sessions.values()].map(({ error, ...s }) => ({ ...s, status: "stopped" }));
  writeFileSync(file + ".tmp", JSON.stringify(records, null, 2), { mode: 0o600 });
  renameSync(file + ".tmp", file);
}
let timer: NodeJS.Timeout | undefined;
export function changed(persist = false) {
  if (persist) save();
  if (!timer) timer = setTimeout(() => {
    timer = undefined;
    changes.emit("change");
  }, 80);
}
export function getSession(id: string): Session {
  const s = sessions.get(id);
  if (!s) throw new Error("找不到会话");
  return s;
}
export function createSession(input: { resumeId?: string; cwd?: string; title?: string }): Session {
  const id = input.resumeId || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error("无效会话 ID");
  if (sessions.has(id)) return getSession(id);
  if (sessions.size >= 200) throw new Error("工作台最多保留 200 个会话入口");
  const cwd = input.cwd || DEFAULT_CWD;
  if (typeof cwd !== "string" || !/^[A-Za-z]:[\\/]/.test(cwd) || /[\0\r\n]/.test(cwd))
    throw new Error("请输入完整的 Windows 本地路径");
  const s: Session = { id, cwd, title: String(input.title || "新会话").slice(0, 100),
    persisted: Boolean(input.resumeId), status: "stopped", updatedAt: new Date().toISOString() };
  sessions.set(id, s);
  changed(true);
  return s;
}
export function syncHistory(items: HistoryItem[]) {
  for (const item of items) {
    const s = sessions.get(item.id);
    if (!s) continue;
    s.persisted = true;
    s.title = item.title;
    s.updatedAt = item.updatedAt;
  }
  changed(true);
}
