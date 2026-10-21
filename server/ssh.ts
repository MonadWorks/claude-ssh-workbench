import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOST, ROOT } from "./config.ts";
import type { Session } from "../shared/types.ts";

export function psQuote(value: string): string {
  if (value.includes("\0")) throw new Error("参数包含无效字符");
  return "'" + value.replaceAll("'", "''") + "'";
}
export function sshProcess(script: string): ChildProcessWithoutNullStreams {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawn(
    "ssh",
    [
      "-T",
      "-C",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=20",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=2",
      HOST,
      "powershell.exe -NoLogo -NoProfile -EncodedCommand " + encoded,
    ],
    { stdio: "pipe" },
  );
}
const bridge = readFileSync(path.join(ROOT, "server/remote.ps1"), "utf8");
export async function remote<T>(
  request: Record<string, unknown>,
  timeout = 45000,
): Promise<T> {
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString(
    "base64",
  );
  const child = sshProcess(
    `$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json;\n` +
      bridge,
  );
  child.stdin.end();
  return new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("远端响应超时，请检查 Tailscale 和 SSH 连接。"));
    }, timeout);
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
      if (stdout.length > 24 * 1024 * 1024) {
        child.kill();
        reject(new Error("返回内容过大"));
      }
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr = (stderr + data).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error(stderr.trim() || `SSH 退出 (${code})`));
      try {
        resolve(JSON.parse(stdout.trim().replace(/^\uFEFF/, "")));
      } catch {
        reject(
          new Error("远端返回格式异常：" + (stderr || stdout).slice(-500)),
        );
      }
    });
  });
}
export function cliArgs(s: Pick<Session, "id" | "persisted">): string[] {
  return ["--dangerously-skip-permissions", s.persisted ? `--resume=${s.id}` : `--session-id=${s.id}`];
}
export function terminalScript(s: Pick<Session, "id" | "cwd" | "persisted">): string {
  return `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';
  try {
    [Console]::InputEncoding=New-Object Text.UTF8Encoding; [Console]::OutputEncoding=New-Object Text.UTF8Encoding;
    $OutputEncoding=[Console]::OutputEncoding;
    $env:Path="$env:USERPROFILE\\.local\\bin;"+$env:Path;
    $env:TERM='xterm-256color'; $env:COLORTERM='truecolor';
    Set-Location -LiteralPath ${psQuote(s.cwd)};
    $id=${psQuote(s.id)};
    $root=Join-Path $env:USERPROFILE '.claude\\projects';
    $saved=@(if(Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName ($id+'.jsonl'))
      }
    }).Count -gt 0;
    $cliArgs=@('--dangerously-skip-permissions');
    if($saved) { $cliArgs+=('--resume='+$id) }
    elseif(${s.persisted ? "$true" : "$false"}) { throw 'The saved Claude session could not be found.' }
    else { $cliArgs+=('--session-id='+$id) }
    & "$env:USERPROFILE\\.local\\bin\\claude.exe" @cliArgs;
    exit $LASTEXITCODE;
  } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
}
export function terminalSshArgs(s: Pick<Session, "id" | "cwd" | "persisted">): string[] {
  const encoded = Buffer.from(terminalScript(s), "utf16le").toString("base64");
  return ["-tt", "-C", "-e", "none", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
    "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", HOST,
    "powershell.exe -NoLogo -NoProfile -EncodedCommand " + encoded];
}
