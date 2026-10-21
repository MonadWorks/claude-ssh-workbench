import { test } from "node:test";
import assert from "node:assert/strict";
import { imageType, MAX_IMAGE_BYTES, sftpPath, sftpQuote, splitBatch } from "../server/uploads.ts";
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
  assert.match(checkBatch([]), /PNG, JPEG/);
  assert.match(checkBatch(Array(21).fill({ size: 1 })), /at most 20/);
  assert.match(checkBatch([{ size: MAX_IMAGE_BYTES + 1 }]), /20 MB/);
  assert.match(checkBatch(Array(6).fill({ size: MAX_IMAGE_BYTES - 1 })), /100 MB/);
});
