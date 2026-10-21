import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HOST } from "./config.ts";
import { remote } from "./ssh.ts";
import { MAX_FILES, MAX_FILE_BYTES, MAX_BATCH_BYTES, MAX_MANIFEST_BYTES, checkFiles, remoteFileName } from "../shared/uploads.ts";

// Same limits as the native macOS uploader.
export const MAX_IMAGES = MAX_FILES;
export const MAX_IMAGE_BYTES = MAX_FILE_BYTES;
export { MAX_BATCH_BYTES, MAX_MANIFEST_BYTES };

export type Stage = "connect" | "transfer" | "verify";
export interface ImageFile { data: Buffer; ext: "png" | "jpg" | "gif" | "webp"; }
export interface UploadFile { data: Buffer; name: string; }

export function splitFiles(body: Buffer): UploadFile[] {
  if (body.length < 4) throw new Error("The upload arrived incomplete. Please retry.");
  const length = body.readUInt32BE(0);
  if (!length || length > MAX_MANIFEST_BYTES || length + 4 > body.length) throw new Error("Invalid file manifest.");
  const manifest: unknown = JSON.parse(body.subarray(4, 4 + length).toString("utf8"));
  if (!Array.isArray(manifest) || manifest.some((f) => !f || typeof f.name !== "string" || !f.name.trim() || typeof f.size !== "number"))
    throw new Error("Invalid file manifest.");
  const reason = checkFiles(manifest);
  if (reason) throw new Error(reason);
  if (manifest.reduce((sum, f) => sum + f.size, 0) !== body.length - 4 - length)
    throw new Error("The upload arrived incomplete. Please retry.");
  let offset = 4 + length;
  return manifest.map((f, i) => ({ name: remoteFileName(f.name, i), data: body.subarray(offset, (offset += f.size)) }));
}

/** Identify an image by its magic bytes; file names and MIME types are not trusted. */
export function imageType(data: Buffer): ImageFile["ext"] | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "jpg";
  const head = data.subarray(0, 6).toString("latin1");
  if (head === "GIF87a" || head === "GIF89a") return "gif";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
}

/** The browser sends one body with the files back to back, plus their sizes. */
export function splitBatch(body: Buffer, sizes: number[]): ImageFile[] {
  if (sizes.length < 1 || sizes.length > MAX_IMAGES) throw new Error(`Send 1 to ${MAX_IMAGES} images at a time.`);
  if (sizes.some((size) => !Number.isInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES))
    throw new Error("Each image must be under 20 MB.");
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total > MAX_BATCH_BYTES) throw new Error("A batch must total under 100 MB.");
  if (total !== body.length) throw new Error("The upload arrived incomplete. Please retry.");
  let offset = 0;
  return sizes.map((size) => {
    const data = body.subarray(offset, (offset += size));
    const ext = imageType(data);
    if (!ext) throw new Error("Only PNG, JPEG, GIF and WebP images can be transmitted.");
    return { data, ext };
  });
}

export function sftpQuote(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error("The file path contains an invalid character.");
  return '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
}
// Windows OpenSSH SFTP treats C:/... as relative; /C:/... is absolute.
export const sftpPath = (windowsPath: string) => "/" + windowsPath.replaceAll("\\", "/");

function sftp(script: string, timeout = 300000): Promise<void> {
  const child = spawn("sftp", ["-q", "-b", "-", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
    "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", HOST], { stdio: "pipe" });
  child.stdin.end(script);
  child.stdin.on("error", () => { /* Process error/exit below reports failures, including early SSH exit. */ });
  child.stdout.resume();
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The transfer timed out. Check that both machines are online and SSH connects, then retry."));
    }, timeout);
    child.stderr.setEncoding("utf8").on("data", (data) => { stderr = (stderr + data).slice(-1600); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(("The transfer failed. Check that the remote host is online and SSH connects.\n" + stderr).trim()));
    });
  });
}

/** Upload into a fresh %USERPROFILE%\ClaudeUploads\<batch> folder and verify every file by SHA-256. */
export async function uploadImages(images: ImageFile[], progress: (stage: Stage) => void): Promise<string[]> {
  return uploadFiles(images.map((image, i) => ({ data: image.data, name: `image-${String(i + 1).padStart(2, "0")}.${image.ext}` })), progress);
}

export async function uploadFiles(files: UploadFile[], progress: (stage: Stage) => void): Promise<string[]> {
  progress("connect");
  const root = await remote<string>({ op: "upload-dir", batch: randomUUID() });
  if (typeof root !== "string" || !/^[A-Za-z]:[\\/]/.test(root) || /[\r\n\0"]/.test(root))
    throw new Error("The remote host returned an invalid upload folder.");
  const names = files.map((file) => file.name);
  const paths = names.map((name) => root + "\\" + name);
  const staging = await mkdtemp(path.join(os.tmpdir(), "claude-files-"));
  try {
    await Promise.all(files.map((file, i) => writeFile(path.join(staging, names[i]), file.data, { mode: 0o600 })));
    progress("transfer");
    await sftp(names.map((name, i) =>
      `put ${sftpQuote(path.join(staging, name))} ${sftpQuote(sftpPath(paths[i]))}`).join("\n") + "\n");
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  progress("verify");
  const hashes = await remote<string[]>({ op: "hashes", paths });
  const expected = files.map((file) => createHash("sha256").update(file.data).digest("hex"));
  if (JSON.stringify(hashes) !== JSON.stringify(expected))
    throw new Error("The remote copy failed verification. Please upload again.");
  return paths;
}
