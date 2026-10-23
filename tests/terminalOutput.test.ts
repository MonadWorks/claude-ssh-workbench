import { test } from "node:test";
import assert from "node:assert/strict";
import xterm from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
import { TerminalOutput } from "../shared/terminalOutput.ts";

const { Terminal } = xterm;
const { SerializeAddon } = serialize;
const options = { cols: 80, rows: 12, allowProposedApi: true };
const write = (t: InstanceType<typeof Terminal>, data: string) => new Promise<void>(resolve => t.write(data, resolve));
const cells = (t: InstanceType<typeof Terminal>) => ({
  cols: t.cols, rows: t.rows, cursor: [t.buffer.active.cursorX, t.buffer.active.cursorY],
  lines: Array.from({ length: t.buffer.active.length }, (_, y) => t.buffer.active.getLine(y)?.translateToString(true)),
});
const previous = "\x1b[?1049h\x1b[H" + "旧内容".repeat(10) + "ABCDEFGHIJKLMNO\r\n2. 旧的列表内容\r\n";
const next = "\x1b[1;1H\x1b[2K1. 中文 English\x1b[2;1H\x1b[2K2. 新的列表\x1b[3;1H\x1b[2K❯ draft 中文";

test("queued output is parsed at its original width before a resize", async () => {
  const reference = new Terminal(options), broken = new Terminal(options), fixed = new Terminal(options);
  await write(reference, previous); reference.resize(40, 12); await write(reference, next);
  broken.write(previous); broken.resize(40, 12); await write(broken, next);
  const output = new TerminalOutput(fixed);
  output.write(previous); output.resize(40, 12); output.write(next); await output.flush();
  assert.notDeepEqual(cells(broken), cells(reference), "the old optimistic resize leaves stale cells");
  assert.deepEqual(cells(fixed), cells(reference));
  for (const t of [reference, broken, fixed]) t.dispose();
});

test("different-sized viewers converge across snapshots, resize and CJK output", async () => {
  const source = new Terminal(options), wide = new Terminal(options), narrow = new Terminal({ ...options, cols: 25 });
  const serializer = new SerializeAddon(); source.loadAddon(serializer);
  const viewers = [wide, narrow].map(t => new TerminalOutput(t));
  await write(source, previous);
  for (const v of viewers) v.restore(source.cols, source.rows, serializer.serialize());
  // Arrive before the asynchronous snapshot write completes.
  for (const cols of [40, 95, 55]) {
    source.resize(cols, 12); await write(source, next);
    for (const v of viewers) { v.resize(cols, 12); v.write(next); }
  }
  await Promise.all(viewers.map(v => v.flush()));
  for (const t of [wide, narrow]) assert.deepEqual(cells(t), cells(source));
  for (const t of [source, wide, narrow]) t.dispose();
});

test("reconnect resets only after old output drains, then restores the input draft", async () => {
  const t = new Terminal(options), reference = new Terminal(options), output = new TerminalOutput(t);
  output.write("old connection output".repeat(100));
  const snapshot = "\x1b[?1049h\x1b[H❯ 未发送的草稿";
  output.restore(42, 12, snapshot);
  output.write(" plus more");
  reference.resize(42, 12); await write(reference, snapshot + " plus more");
  await output.flush();
  assert.deepEqual(cells(t), cells(reference));
  t.dispose(); reference.dispose();
});

test("disposing a viewer cancels pending writes and callbacks", async () => {
  const t = new Terminal(options), output = new TerminalOutput(t);
  let called = false;
  output.write("stale", () => { called = true; });
  output.resize(40, 8);
  output.dispose();
  await output.flush();
  assert.equal(called, false);
  assert.equal(t.cols, 80);
  assert.equal(t.buffer.active.getLine(0)?.translateToString(true), "");
  t.dispose();
});
