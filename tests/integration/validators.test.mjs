import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runValidator(script) {
  return spawnSync(process.execPath, [path.join("scripts/validation", script)], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("設定検証スクリプトが成功する", () => {
  const res = runValidator("validate-config.mjs");
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test("プロンプト検証スクリプトが成功する", () => {
  const res = runValidator("validate-prompts.mjs");
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test("移行台帳検証スクリプトが成功する", () => {
  const res = runValidator("validate-migration.mjs");
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test("秘密情報スキャンが検出なしで成功する", () => {
  const res = runValidator("scan-secrets.mjs");
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
