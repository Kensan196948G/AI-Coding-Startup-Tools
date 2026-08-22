import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("WebUI serverはpackage.jsonをversion正本として読む", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const server = fs.readFileSync(path.join(ROOT, "webui/server.mjs"), "utf8");
  assert.equal(pkg.version, "1.0.0");
  assert.match(server, /TOOLKIT_VERSION = JSON\.parse\(fs\.readFileSync/);
});

test("package-lock.json のルートバージョンが package.json と一致する", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  assert.equal(lock.version, pkg.version, "package-lock のルート version が乖離している");
  assert.equal(lock.packages?.[""]?.version, pkg.version, "packages[''] の version が乖離している");
});

test("Project選択は配列indexを明示し参照比較を使わない", () => {
  const app = fs.readFileSync(path.join(ROOT, "webui/public/app.js"), "utf8");
  assert.ok(!app.includes("rows.indexOf(sel)"), "参照比較による index=-1 を防ぐ");
  assert.match(app, /data-action=\\?"select-project/);
});

test("WebUI はインラインイベントハンドラを持たない (CSP script-src 'self' 準拠)", () => {
  const html = fs.readFileSync(path.join(ROOT, "webui/public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "webui/public/app.js"), "utf8");
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/, "インライン script ブロックを禁止");
  assert.doesNotMatch(html, /\sonclick=|\soninput=|\sonkeydown=/, "インラインイベント属性を禁止");
  assert.doesNotMatch(app, /\sonclick=|\soninput=|\sonkeydown=/, "生成 HTML のインラインイベント属性を禁止");
});
