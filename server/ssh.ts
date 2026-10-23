import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { HOST, ROOT } from "./config.ts";
import type { Session } from "../shared/types.ts";

export function psQuote(value: string): string {
  if (value.includes("\0")) throw new Error("Argument contains an invalid character");
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
      reject(new Error("The remote host timed out. Check the network (e.g. Tailscale) and the SSH connection."));
    }, timeout);
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
      if (stdout.length > 24 * 1024 * 1024) {
        child.kill();
        reject(new Error("Response too large"));
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
        return reject(new Error(stderr.trim() || `SSH exited (${code})`));
      try {
        resolve(JSON.parse(stdout.trim().replace(/^\uFEFF/, "")));
      } catch {
        reject(
          new Error("Unexpected response from the remote host: " + (stderr || stdout).slice(-500)),
        );
      }
    });
  });
}
export function cliArgs(s: Pick<Session, "id" | "persisted">): string[] {
  return ["--dangerously-skip-permissions", s.persisted ? `--resume=${s.id}` : `--session-id=${s.id}`];
}
export function workerScript(s: Pick<Session, "id" | "cwd" | "persisted">): string {
  return `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';
  try {
    [Console]::InputEncoding=New-Object Text.UTF8Encoding; [Console]::OutputEncoding=New-Object Text.UTF8Encoding;
    $OutputEncoding=[Console]::OutputEncoding;
    $env:Path="$env:USERPROFILE\\.local\\bin;"+[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User');
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
const persistentTerminal = readFileSync(path.join(ROOT, "server/persistent-terminal.ps1"), "utf8")
  .split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
export function terminalScript(s: Pick<Session, "id" | "cwd" | "persisted">): string {
  return `$sessionId=${psQuote(s.id)}; $workspace=${psQuote(s.cwd)};\n` +
    `$workerScript=${psQuote(workerScript(s))};\n` + persistentTerminal;
}
export function terminalSshArgs(s: Pick<Session, "id" | "cwd" | "persisted">): string[] {
  // Windows' SSH shell has a small command-line limit. Compress the bootstrap
  // rather than truncating paths or transferring a mutable shared script.
  const packed = gzipSync(Buffer.from(terminalScript(s), "utf8"), { level: 9 }).toString("base64");
  const bootstrap = `$b=[Convert]::FromBase64String('${packed}');` +
    `$m=New-Object IO.MemoryStream(,$b);` +
    `$g=New-Object IO.Compression.GzipStream($m,[IO.Compression.CompressionMode]::Decompress);` +
    `$r=New-Object IO.StreamReader($g,[Text.Encoding]::UTF8);Invoke-Expression $r.ReadToEnd()`;
  const encoded = Buffer.from(bootstrap, "utf16le").toString("base64");
  if (encoded.length > 7900) throw new Error("The remote launch command exceeds Windows' command-line limit. Use a shorter workspace path.");
  return ["-tt", "-C", "-e", "none", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
    "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", HOST,
    "powershell.exe -NoLogo -NoProfile -EncodedCommand " + encoded];
}
