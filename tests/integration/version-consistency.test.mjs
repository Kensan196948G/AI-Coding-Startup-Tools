import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("package.json のバージョンが WebUI のデモ表示と一致する", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const html = fs.readFileSync(path.join(ROOT, "webui/public/index.html"), "utf8");
  assert.match(html, new RegExp(`toolkitVersion: '${pkg.version}'`));
});
