import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
// node-pty 1.1 ships its macOS helper without the executable bit.
if (process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("node-pty/package.json"));
  for (const relative of [`prebuilds/darwin-${process.arch}/spawn-helper`, "build/Release/spawn-helper"]) {
    const file = path.join(root, relative);
    if (existsSync(file)) chmodSync(file, 0o755);
  }
}
