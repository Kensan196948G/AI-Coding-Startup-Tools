import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { PathGuardError, resolveSafeOutput } from "../../scripts/validation/lib/pathguard.mjs";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-tools-test-"));
}

test("UT-PATH-001: ../ を含む出力パスを拒否する", () => {
  const root = makeRoot();
  assert.throws(
    () => resolveSafeOutput(root, "../evil.txt"),
    (e) => e instanceof PathGuardError && e.code === "SECURITY",
  );
});

test("UT-PATH-002: 絶対パスを拒否する", () => {
  const root = makeRoot();
  assert.throws(
    () => resolveSafeOutput(root, path.join(root, "outside.txt")),
    (e) => e instanceof PathGuardError && e.code === "SECURITY",
  );
});

test("UT-PATH-003: 通常の相対パスは解決される", () => {
  const root = makeRoot();
  const resolved = resolveSafeOutput(root, "docs/report.md");
  assert.equal(resolved, path.join(root, "docs", "report.md"));
});

test("UT-PATH-004: シンボリックリンク経由のルート外書込みを拒否する", (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  const link = path.join(root, "link");
  try {
    fs.symlinkSync(outside, link, "dir");
  } catch {
    t.skip("シンボリックリンク作成に権限が必要");
    return;
  }
  assert.throws(
    () => resolveSafeOutput(root, "link/evil.txt"),
    (e) => e instanceof PathGuardError && e.code === "SECURITY",
  );
});
