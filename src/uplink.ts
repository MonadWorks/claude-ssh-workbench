import { checkFiles, fileHeader } from "../shared/uploads";
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type Stage = "connect" | "transfer" | "verify";

/** A reason the batch cannot be sent, or "" when it is acceptable. */
export const checkBatch = checkFiles;

/** Quoted, space-separated and never newline-terminated, so inserting it cannot submit a prompt. */
export const pathsText = (paths: string[]) => paths.map((p) => `"${p}"`).join(" ");

/** POST the batch and follow the server's NDJSON stage stream until it yields remote paths. */
export async function transmit(files: File[], onStage: (stage: Stage) => void): Promise<string[]> {
  const response = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Workbench-Request": "1" },
    body: new Blob([fileHeader(files), ...files]),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed (${response.status})`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try { for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.error) throw new Error(message.error);
      if (message.paths) return message.paths;
      if (message.stage) onStage(message.stage);
    }
  } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  throw new Error("The connection closed before the upload finished.");
}

/** Small JPEG preview for the transmission card and the manifest; "" if the image cannot be decoded. */
export async function thumbnail(file: File, size = 160): Promise<string> {
  if (!TYPES.includes(file.type) && !/\.(png|jpe?g|gif|webp)$/i.test(file.name)) return "";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return "";
  }
}
