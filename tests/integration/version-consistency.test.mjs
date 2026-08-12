import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("package.json のバージョンが WebUI (app.js) のデモ表示と一致する", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const app = fs.readFileSync(path.join(ROOT, "webui/public/app.js"), "utf8");
  assert.match(app, new RegExp(`toolkitVersion: '${pkg.version}'`));
});

test("CLI 起動ボタンがプロジェクトをパス一致で解決する (indexOf(sel) の参照比較バグ防止)", () => {
  const app = fs.readFileSync(path.join(ROOT, "webui/public/app.js"), "utf8");
  assert.ok(!app.includes("rows.indexOf(sel)"), "参照比較による index=-1 を防ぐ");
  assert.ok(app.includes("indexOfPath(rows, sel)"), "パス一致ヘルパーを使用する");
});

test("WebUI はインラインイベントハンドラを持たない (CSP script-src 'self' 準拠)", () => {
  const html = fs.readFileSync(path.join(ROOT, "webui/public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "webui/public/app.js"), "utf8");
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/, "インライン script ブロックを禁止");
  assert.doesNotMatch(html, /\sonclick=|\soninput=|\sonkeydown=/, "インラインイベント属性を禁止");
  assert.doesNotMatch(app, /\sonclick=|\soninput=|\sonkeydown=/, "生成 HTML のインラインイベント属性を禁止");
});
