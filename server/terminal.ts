import * as pty from "node-pty";
import xterm from "@xterm/headless";
const { Terminal } = xterm;
import serialize from "@xterm/addon-serialize";
const { SerializeAddon } = serialize;
import { WebSocket } from "ws";
import { ROOT } from "./config.ts";
import { terminalSshArgs } from "./ssh.ts";
import { changed, getSession } from "./sessions.ts";
import type { Session } from "../shared/types.ts";
import { TerminalOutput } from "../shared/terminalOutput.ts";

type Runtime = {
  process: pty.IPty;
  screen: InstanceType<typeof Terminal>;
  serializer: InstanceType<typeof SerializeAddon>;
  output: TerminalOutput;
  clients: Set<WebSocket>;
  ended: boolean;
};
const runtimes = new Map<string, Runtime>();
export function dimensions(cols: unknown, rows: unknown) {
  const c = Number(cols), r = Number(rows);
  if (!Number.isInteger(c) || !Number.isInteger(r) || c < 20 || c > 400 || r < 5 || r > 200)
    throw new Error("Invalid terminal size");
  return { cols: c, rows: r };
}
function send(ws: WebSocket, data: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 2 * 1024 * 1024) { ws.close(1013, "Reconnect to restore terminal"); return; }
  ws.send(JSON.stringify(data));
}
function start(s: Session, cols: number, rows: number): Runtime {
  const existing = runtimes.get(s.id);
  if (existing) return existing;
  if (runtimes.size >= 8) throw new Error("At most 8 terminals can be open at once. Use /exit in one of them first.");
  s.status = "connecting";
  s.error = undefined;
  changed();
  const screen = new Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true });
  const serializer = new SerializeAddon();
  screen.loadAddon(serializer);
  let process: pty.IPty;
  try {
    process = pty.spawn("ssh", terminalSshArgs(s), {
      name: "xterm-256color", cols, rows, cwd: ROOT,
      env: { ...globalThis.process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });
  } catch (e) { screen.dispose(); throw e; }
  const output = new TerminalOutput(screen);
  const runtime: Runtime = { process, screen, serializer, output, clients: new Set(), ended: false };
  runtimes.set(s.id, runtime);
  // Answer cursor/device queries even while the browser is closed. Browser-side
  // query replies are filtered so multiple viewers cannot duplicate them.
  screen.onData((data) => { if (!runtime.ended) process.write(data); });
  let queued = 0;
  process.onData((data) => {
    if (s.status === "connecting") { s.status = "idle"; changed(); }
    queued += data.length;
    if (queued > 1024 * 1024) process.pause();
    output.write(data, () => {
      for (const ws of runtime.clients) send(ws, { type: "data", data });
      queued -= data.length;
      if (!runtime.ended && queued < 128 * 1024) process.resume();
    });
  });
  process.onExit(({ exitCode }) => {
    runtime.ended = true;
    runtimes.delete(s.id);
    s.status = exitCode === 0 ? "stopped" : "error";
    s.error = exitCode === 0 ? undefined : `The remote terminal exited (${exitCode}). Check the terminal output, then retry.`;
    changed(true);
    output.after(() => {
      for (const ws of runtime.clients) {
        send(ws, { type: "exit", code: exitCode, error: s.error });
        ws.close(1000);
      }
      runtime.clients.clear();
      output.dispose();
      screen.dispose();
    });
  });
  return runtime;
}
export function attachTerminal(ws: WebSocket, id: string, cols: number, rows: number) {
  const s = getSession(id);
  let runtime: Runtime;
  try { runtime = start(s, cols, rows); }
  catch (e) {
    s.status = "error";
    s.error = (e as Error).message;
    changed();
    send(ws, { type: "exit", code: 1, error: s.error });
    ws.close(1000);
    return;
  }
  ws.on("close", () => runtime.clients.delete(ws));
  ws.on("error", () => runtime.clients.delete(ws));
  ws.on("message", (raw, binary) => {
    if (binary || runtime.ended) return;
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "input" && typeof message.data === "string" && message.data.length <= 32768) {
        runtime.process.write(message.data);
      } else if (message.type === "resize") {
        const size = dimensions(message.cols, message.rows);
        runtime.output.after(() => {
          if (runtime.ended) return;
          const resized = runtime.screen.cols !== size.cols || runtime.screen.rows !== size.rows;
          runtime.screen.resize(size.cols, size.rows);
          // Every viewer consumes the same VT stream at the same grid size.
          // Announce the change between output chunks, before asking SSH to resize.
          for (const client of runtime.clients) send(client, { type: "resize", ...size });
          if (resized) runtime.process.resize(size.cols, size.rows);
        });
      } else throw new Error("Invalid terminal message");
    } catch { ws.close(1008, "Invalid terminal message"); }
  });
  // A serialized VT screen preserves cursor, colors, alternate buffer and input
  // across refresh/switch, without replaying an unbounded log of control bytes.
  runtime.output.after(() => {
    if (runtime.ended || ws.readyState !== WebSocket.OPEN) return;
    send(ws, { type: "snapshot", cols: runtime.screen.cols, rows: runtime.screen.rows,
      data: runtime.serializer.serialize() });
    runtime.clients.add(ws);
  });
}
export function shutdown() {
  for (const runtime of runtimes.values()) runtime.process.kill();
}
