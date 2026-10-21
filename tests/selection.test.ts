import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseSession } from "../src/sessionSelection.ts";
import type { Session } from "../shared/types.ts";

const sessions = [
  { id: "older", status: "stopped", updatedAt: "2026-10-20T01:00:00Z" },
  { id: "latest", status: "stopped", updatedAt: "2026-10-21T01:00:00Z" },
] as Session[];

test("refresh restores the selected session even when another is newer", () => {
  assert.equal(chooseSession(sessions, "older")?.id, "older");
});

test("missing selection recovers an active session, otherwise the latest entry", () => {
  assert.equal(chooseSession(sessions, "removed")?.id, "latest");
  const active = sessions.map((s) => s.id === "older"
    ? { ...s, status: "idle" as const } : s);
  assert.equal(chooseSession(active, null)?.id, "older");
  assert.equal(sessions[0].id, "older");
});

test("a fresh workbench requests a new session rather than importing remote history", () => {
  assert.equal(chooseSession([], "missing"), undefined);
});
