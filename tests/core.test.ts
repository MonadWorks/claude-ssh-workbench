import { test } from "node:test";
import assert from "node:assert/strict";
import { cliArgs, psQuote, terminalScript, terminalSshArgs } from "../server/ssh.ts";
import xterm from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
const { Terminal } = xterm;
const { SerializeAddon } = serialize;
const id = "12345678-1234-1234-1234-123456789012";
test("every new and resumed terminal starts interactive Claude with bypass enabled", () => {
  for (const persisted of [false, true]) {
    const args = cliArgs({id, persisted});
    assert.deepEqual(args, ["--dangerously-skip-permissions", `${persisted ? '--resume' : '--session-id'}=${id}`]);
    const options = { id, persisted, cwd: "C:\\Projects\\demo" };
    const ssh = terminalSshArgs(options);
    assert.equal(ssh[0], "-tt");
    const script = Buffer.from(ssh.at(-1)!.split("-EncodedCommand ")[1], "base64").toString("utf16le");
    assert.equal(script, terminalScript(options));
    assert.ok(script.includes("$cliArgs=@('--dangerously-skip-permissions')"));
    assert.ok(script.includes("Test-Path -LiteralPath (Join-Path $_.FullName ($id+'.jsonl'))"));
    assert.ok(!script.includes('stream-json'));
    assert.ok(!script.includes('set_permission_mode'));
  }
});
test("Windows paths remain literal, including quotes and shell syntax", () => {
  assert.equal(psQuote("C:\\work\\a'b; $(Write-Output pwn)"), "'C:\\work\\a''b; $(Write-Output pwn)'");
  assert.throws(() => psQuote("bad\0path"));
});
test("terminal snapshot preserves Unicode, cursor position and alternate screen", async () => {
  const source = new Terminal({cols:80, rows:24, allowProposedApi:true});
  const restored = new Terminal({cols:80, rows:24, allowProposedApi:true});
  const addon = new SerializeAddon();
  source.loadAddon(addon);
  const write = (t: InstanceType<typeof Terminal>, text: string) => new Promise<void>(resolve=>t.write(text,resolve));
  await write(source, '\x1b[?1049h\x1b[32mClaude 中文\x1b[0m\r\n❯ draft');
  await write(restored, addon.serialize());
  assert.equal(restored.buffer.active.type, source.buffer.active.type);
  assert.equal(restored.buffer.active.cursorX, source.buffer.active.cursorX);
  assert.equal(restored.buffer.active.cursorY, source.buffer.active.cursorY);
  assert.equal(restored.buffer.active.getLine(0)?.translateToString(true), 'Claude 中文');
  assert.equal(restored.buffer.active.getLine(1)?.translateToString(true), '❯ draft');
  source.dispose(); restored.dispose();
});
