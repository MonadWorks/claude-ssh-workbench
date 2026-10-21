import type { Session } from "../shared/types";

// Restore only a workbench entry; never open an unrelated remote history item.
export function chooseSession(sessions: Session[], remembered: string | null) {
  const previous = sessions.find((s) => s.id === remembered);
  if (previous) return previous;
  const recent = [...sessions].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return recent.find((s) => ["connecting", "idle"].includes(s.status))
    ?? recent[0];
}
