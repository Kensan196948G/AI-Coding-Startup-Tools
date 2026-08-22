import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repositoryRoot, "scripts", "validation", "validate-workspace.mjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-workspace-cli-"));
  const workspace = path.join(root, "Project-A");
  fs.mkdirSync(workspace);
  return { root, workspace };
}

test("Workspace CLI: 有効なLocal Projectのcanonical pathをstdoutへ返す", () => {
  const data = fixture();
  const result = spawnSync(
    process.execPath,
    [cli, "--workspace", data.workspace, "--storage", "local", "--local-root", data.root],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), fs.realpathSync(data.workspace));
  assert.equal(result.stderr, "");
});
test("Workspace CLI: Root外、未知option、必須option不足を非0で拒否する", () => {
  const data = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-workspace-outside-"));
  for (const args of [
    ["--workspace", outside, "--storage", "local", "--local-root", data.root],
    ["--unknown", "value"],
    ["--workspace", data.workspace],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Workspace validation failed/u);
    assert.equal(result.stdout, "");
  }
});
