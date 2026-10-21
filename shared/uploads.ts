export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export interface FileMeta { name: string; size: number; }

export function checkFiles(files: { size: number }[]): string {
  if (!files.length || files.length > MAX_FILES) return `Choose 1 to ${MAX_FILES} files at a time.`;
  if (files.some((f) => !Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_FILE_BYTES))
    return "Each file must be at most 20 MB.";
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BATCH_BYTES) return "A batch must total at most 100 MB.";
  return "";
}

/** Keep recognizable names while preventing path traversal and shell/control characters. */
export function remoteFileName(name: string, index: number): string {
  const leaf = name.split(/[\\/]/).pop() || "file";
  const clean = leaf.replace(/[^\p{L}\p{N}\p{M} ._()-]/gu, "_").replace(/[ .]+$/g, "").trim() || "file";
  const suffix = clean.match(/\.[A-Za-z0-9]{1,16}$/)?.[0] || "";
  const stem = suffix ? clean.slice(0, -suffix.length) : clean;
  let short = "", bytes = 0;
  for (const character of Array.from(stem).slice(0, 96)) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > 180) break;
    short += character;
  }
  return `${String(index + 1).padStart(2, "0")}-${short || "file"}${suffix}`;
}

/** Length-prefixed UTF-8 metadata avoids putting Unicode filenames into HTTP headers. */
export function fileHeader(files: FileMeta[]): ArrayBuffer {
  const reason = checkFiles(files);
  if (reason) throw new Error(reason);
  const manifest = new TextEncoder().encode(JSON.stringify(files.map(({ name, size }) => ({ name, size }))));
  if (manifest.length > MAX_MANIFEST_BYTES) throw new Error("The file names are too long.");
  const header = new ArrayBuffer(4 + manifest.length);
  new DataView(header).setUint32(0, manifest.length);
  new Uint8Array(header, 4).set(manifest);
  return header;
}
