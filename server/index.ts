import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { DEFAULT_CWD, HOST, PORT, ROOT } from "./config.ts";
import { remote } from "./ssh.ts";
import { changes, createSession, getSession, sessions, syncHistory } from "./sessions.ts";
import { attachTerminal, dimensions, shutdown } from "./terminal.ts";
import { MAX_BATCH_BYTES, MAX_MANIFEST_BYTES, splitBatch, splitFiles, uploadImages, uploadFiles } from "./uploads.ts";
import type { HistoryItem } from "../shared/types.ts";

const app = express(),
  server = createServer(app);
const hosts = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
  "127.0.0.1:5173",
  "localhost:5173",
]);
const origins = new Set([...hosts].map((host) => "http://" + host));
app.use((req, res, next) => {
  if (
    !hosts.has(req.headers.host || "") ||
    (req.headers.origin && !origins.has(req.headers.origin))
  )
    return res.status(403).json({ error: "Only the local workbench may access this server" });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-workbench-request"] !== "1"
  )
    return res.status(403).json({ error: "Missing request marker" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.get("/api/bootstrap", (_req, res) =>
  res.json({
    host: HOST,
    defaultCwd: DEFAULT_CWD,
    sessions: [...sessions.values()],
  }),
);
app.get("/api/status", async (_req, res) =>
  res.json(await remote({ op: "status" })),
);
app.get("/api/history", async (_req, res) => {
  const data = await remote<{ sessions: HistoryItem[] }>({ op: "sessions" });
  syncHistory(data.sessions);
  res.json(data);
});
app.get("/api/directory", async (req, res) =>
  res.json(
    await remote({ op: "directory", path: req.query.path || DEFAULT_CWD }),
  ),
);
app.get("/api/file", async (req, res) =>
  res.json(await remote({ op: "read", path: req.query.path })),
);
app.get("/api/changes", async (req, res) =>
  res.json(await remote({ op: "changes", path: req.query.path })),
);
app.post("/api/sessions", (req, res) => res.json(createSession(req.body)));
app.post("/api/files", express.raw({ type: "application/octet-stream", limit: MAX_BATCH_BYTES + MAX_MANIFEST_BYTES + 4 }), async (req, res) => {
  const files = splitFiles(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  res.type("application/x-ndjson");
  const send = (message: object) => res.write(JSON.stringify(message) + "\n");
  try { send({ paths: await uploadFiles(files, (stage) => send({ stage })) }); }
  catch (error) { send({ error: (error as Error).message }); }
  res.end();
});
// Streams NDJSON: {stage} lines while the batch crosses SSH, then {paths} or {error}.
app.post("/api/images", express.raw({ type: "application/octet-stream", limit: MAX_BATCH_BYTES }), async (req, res) => {
  const sizes = String(req.query.sizes || "").split(",").map(Number);
  const images = splitBatch(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), sizes);
  res.type("application/x-ndjson");
  const send = (message: object) => res.write(JSON.stringify(message) + "\n");
  try {
    send({ paths: await uploadImages(images, (stage) => send({ stage })) });
  } catch (error) {
    send({ error: (error as Error).message });
  }
  res.end();
});
app.get("/api/sessions/:id", (req, res) => res.json(getSession(req.params.id)));
app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint" }));
app.use(express.static(path.join(ROOT, "dist")));
app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "dist/index.html")));
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(400).json({ error: error.message }),
);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const terminals = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (!hosts.has(req.headers.host || "") || !origins.has(req.headers.origin || "")) {
    socket.destroy(); return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/events") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (url.pathname === "/terminal") {
    try {
      const id = url.searchParams.get("id") || "";
      getSession(id);
      const { cols, rows } = dimensions(url.searchParams.get("cols"), url.searchParams.get("rows"));
      terminals.handleUpgrade(req, socket, head, (ws) => attachTerminal(ws, id, cols, rows));
    } catch { socket.destroy(); }
  } else socket.destroy();
});
const snapshot = () =>
  JSON.stringify({ type: "sessions", sessions: [...sessions.values()] });
wss.on("connection", (ws) => ws.send(snapshot()));
changes.on("change", () => {
  const data = snapshot();
  for (const ws of wss.clients)
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2 * 1024 * 1024)
      ws.send(data);
});
const heartbeat = setInterval(() => {
  for (const ws of [...wss.clients, ...terminals.clients]) if (ws.readyState === WebSocket.OPEN) ws.ping();
}, 20000);
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Claude SSH Workbench http://127.0.0.1:${PORT}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(heartbeat);
    shutdown();
    wss.close();
    terminals.close();
    server.close();
    setTimeout(() => process.exit(0), 1000).unref();
  });
