// Browser side of the image uplink. Limits mirror server/uploads.ts.
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type Stage = "connect" | "transfer" | "verify";

export const imageFiles = (files: Iterable<File> | ArrayLike<File>) =>
  Array.from(files).filter((file) => TYPES.includes(file.type));

/** A reason the batch cannot be sent, or "" when it is acceptable. */
export function checkBatch(files: { size: number }[]): string {
  if (!files.length) return "Only PNG, JPEG, GIF and WebP images can be transmitted.";
  if (files.length > MAX_IMAGES) return `Send at most ${MAX_IMAGES} images at a time.`;
  if (files.some((file) => file.size > MAX_IMAGE_BYTES)) return "Each image must be under 20 MB.";
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) return "A batch must total under 100 MB.";
  return "";
}

/** Quoted, space-separated and never newline-terminated, so inserting it cannot submit a prompt. */
export const pathsText = (paths: string[]) => paths.map((p) => `"${p}"`).join(" ");

/** POST the batch and follow the server's NDJSON stage stream until it yields remote paths. */
export async function transmit(files: File[], onStage: (stage: Stage) => void): Promise<string[]> {
  const response = await fetch(`/api/images?sizes=${files.map((f) => f.size).join(",")}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Workbench-Request": "1" },
    body: new Blob(files),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed (${response.status})`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
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
  }
  throw new Error("The connection closed before the upload finished.");
}

/** Small JPEG preview for the transmission card and the manifest; "" if the image cannot be decoded. */
export async function thumbnail(file: File, size = 160): Promise<string> {
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
