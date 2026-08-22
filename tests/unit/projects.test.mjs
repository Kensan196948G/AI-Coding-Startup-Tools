import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isInsideRoot, listProjects, resolveInsideRoot } from "../../webui/lib/projects.mjs";

test("Git Workspaceだけを列挙する", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "projects-"));
  fs.mkdirSync(path.join(root, "valid", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "plain"));
  assert.deepEqual(listProjects(root).map((p) => p.name), ["valid"]);
});

test("Root外とprefix衝突を拒否する", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-"));
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  assert.equal(isInsideRoot(root, project), true);
  assert.equal(isInsideRoot(root, `${root}-other`), false);
});

test("symlink経由のRoot外を拒否する", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-out-"));
  const link = path.join(root, "escape");
  try { fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir"); }
  catch { t.skip("symlink作成権限がありません"); return; }
  assert.equal(resolveInsideRoot(root, link), null);
});
