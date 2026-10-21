import { test } from "node:test";
import assert from "node:assert/strict";
import { imageType, MAX_IMAGE_BYTES, sftpPath, sftpQuote, splitBatch, splitFiles } from "../server/uploads.ts";
import { fileHeader, MAX_MANIFEST_BYTES, remoteFileName } from "../shared/uploads.ts";
import { checkBatch, pathsText } from "../src/uplink.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=", "base64");
const jpg = Buffer.from([255, 216, 255, 224, 0, 16]);
const gif = Buffer.from("GIF89a\x01\x00", "latin1");
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);

test("images are identified by content, not by name or MIME type", () => {
  assert.equal(imageType(png), "png");
  assert.equal(imageType(jpg), "jpg");
  assert.equal(imageType(gif), "gif");
  assert.equal(imageType(webp), "webp");
  assert.equal(imageType(Buffer.from("<svg></svg>")), undefined);
});

test("a batch body splits back into its images and rejects anything malformed", () => {
  const images = splitBatch(Buffer.concat([png, jpg]), [png.length, jpg.length]);
  assert.deepEqual(images.map((i) => i.ext), ["png", "jpg"]);
  assert.ok(images[1].data.equals(jpg));
  assert.throws(() => splitBatch(png, [png.length + 1]), /incomplete/);
  assert.throws(() => splitBatch(png, [0]), /20 MB/);
  assert.throws(() => splitBatch(Buffer.alloc(0), [Number.NaN]));
  assert.throws(() => splitBatch(Buffer.from("not an image"), [12]), /PNG, JPEG/);
  assert.throws(() => splitBatch(png, Array(21).fill(1)), /1 to 20/);
  assert.throws(() => splitBatch(Buffer.alloc(0), [MAX_IMAGE_BYTES + 1]), /20 MB/);
});

test("SFTP batch arguments stay literal and use absolute Windows paths", () => {
  assert.equal(sftpQuote('/tmp/a "b"\\c'), '"/tmp/a \\"b\\"\\\\c"');
  assert.throws(() => sftpQuote("/tmp/ok\nput bad"));
  assert.equal(sftpPath("C:\\Users\\Name With Space\\ClaudeUploads\\image-01.png"),
    "/C:/Users/Name With Space/ClaudeUploads/image-01.png");
});

test("inserted paths are quoted and can never submit a prompt", () => {
  const text = pathsText(["C:\\Users\\a b\\image-01.png", "C:\\x\\image-02.jpg"]);
  assert.equal(text, '"C:\\Users\\a b\\image-01.png" "C:\\x\\image-02.jpg"');
  assert.ok(!/[\r\n]/.test(text));
});

test("the browser rejects oversized or empty batches before uploading", () => {
  assert.equal(checkBatch([{ size: 10 }]), "");
  assert.match(checkBatch([]), /1 to 20/);
  assert.match(checkBatch(Array(21).fill({ size: 1 })), /1 to 20/);
  assert.match(checkBatch([{ size: MAX_IMAGE_BYTES + 1 }]), /20 MB/);
  assert.match(checkBatch(Array(6).fill({ size: MAX_IMAGE_BYTES - 1 })), /100 MB/);
});

test("PDFs, text, images and empty files arrive unchanged in one named batch", () => {
  const bodies = [Buffer.from("%PDF-1.7\nexample"), Buffer.from("你好\n"), png, Buffer.alloc(0)];
  const names = ["需求 文档.pdf", "notes.txt", "screen.png", "empty.txt"];
  const header = Buffer.from(fileHeader(names.map((name, i) => ({ name, size: bodies[i].length }))));
  const files = splitFiles(Buffer.concat([header, ...bodies]));
  assert.deepEqual(files.map((f) => f.name), ["01-需求 文档.pdf", "02-notes.txt", "03-screen.png", "04-empty.txt"]);
  files.forEach((file, i) => assert.deepEqual(file.data, bodies[i]));
  assert.throws(() => splitFiles(Buffer.concat([header, ...bodies, Buffer.from("extra")])), /incomplete/);
});

test("file manifests reject broken frames, missing names and invalid sizes", () => {
  const frame = (meta: unknown) => { const m = Buffer.from(JSON.stringify(meta)), n = Buffer.alloc(4); n.writeUInt32BE(m.length); return Buffer.concat([n, m]); };
  for (const bad of [null, {}, [null], [{ name: "", size: 0 }], [{ name: "x", size: -1 }], [{ name: "x", size: 0.5 }]])
    assert.throws(() => splitFiles(frame(bad)));
  assert.throws(() => splitFiles(Buffer.alloc(3)));
  const huge = Buffer.alloc(4); huge.writeUInt32BE(MAX_MANIFEST_BYTES + 1);
  assert.throws(() => splitFiles(huge), /manifest/);
  assert.throws(() => splitFiles(Buffer.from([0, 0, 0, 1, 123])));
});

test("remote names stay inside the batch folder and cannot inject terminal commands", () => {
  assert.equal(remoteFileName("../../需求 文档.pdf", 0), "01-需求 文档.pdf");
  assert.equal(remoteFileName("C:\\private\\report.pdf", 1), "02-report.pdf");
  const name = remoteFileName('report$(bad)`; &"\r\n.pdf', 0);
  assert.ok(!/[$`;"&\r\n\\/]/.test(name));
  assert.notEqual(remoteFileName("same.pdf", 0), remoteFileName("same.pdf", 1));
  assert.ok(remoteFileName("a".repeat(500) + ".pdf", 0).endsWith(".pdf"));
  assert.ok(Buffer.byteLength(remoteFileName("论文".repeat(100) + ".pdf", 0)) < 255);
});
