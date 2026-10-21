export type Status = "stopped" | "connecting" | "idle" | "error";
export interface Session {
  id: string;
  title: string;
  cwd: string;
  status: Status;
  updatedAt: string;
  persisted: boolean;
  error?: string;
}
export interface HistoryItem {
  id: string;
  title: string;
  cwd: string;
  updatedAt: string;
  size: number;
}
export interface Entry { name: string; path: string; directory: boolean; size: number; }
export interface Directory { path: string; parent: string | null; entries: Entry[]; truncated: boolean; }
export interface FileContent { path: string; content: string; hash: string; }
export interface ChangeSet { available: boolean; reason?: string; status?: string; diff?: string; truncated?: boolean; }
export interface Bootstrap { host: string; defaultCwd: string; sessions: Session[]; }
