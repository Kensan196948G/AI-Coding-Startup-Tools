import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  isInsideRoot,
  isInsideWindowsRoot,
  isProjectDir,
  listProjects,
} from "../../webui/lib/projects.mjs";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-webui-test-"));
}

test("判定基準C: .git と .ai-startup-tools の両方を持つフォルダだけを検出する", () => {
  const root = makeRoot();
  const good = path.join(root, "good");
  const onlygit = path.join(root, "onlygit");
  const plain = path.join(root, "plain");
  fs.mkdirSync(path.join(good, ".git"), { recursive: true });
  fs.mkdirSync(path.join(good, ".ai-startup-tools"), { recursive: true });
  fs.mkdirSync(path.join(onlygit, ".git"), { recursive: true });
  fs.mkdirSync(plain, { recursive: true });

  assert.equal(isProjectDir(good), true);
  assert.equal(isProjectDir(onlygit), false);
  assert.equal(isProjectDir(plain), false);

  const projects = listProjects(root);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "good");
});

test("listProjects はルートが存在しない場合に空配列を返す", () => {
  assert.deepEqual(listProjects(path.join(os.tmpdir(), "does-not-exist-ai-webui")), []);
});

test("isInsideRoot は配下のみ許可する", () => {
  const root = makeRoot();
  assert.equal(isInsideRoot(root, path.join(root, "sub", "project")), true);
  assert.equal(isInsideRoot(root, path.join(root, "project")), true);
  assert.equal(isInsideRoot(root, path.join(root, "..", "other")), false);
});

test("isInsideWindowsRoot は大文字小文字と区切り文字を無視する", () => {
  assert.equal(isInsideWindowsRoot("C:\\projects", "c:/projects/foo"), true);
  assert.equal(isInsideWindowsRoot("C:\\projects", "C:\\projects"), true);
  assert.equal(isInsideWindowsRoot("C:\\projects", "D:\\projects\\foo"), false);
  assert.equal(isInsideWindowsRoot("C:\\projects", "C:\\projects2\\foo"), false);
});
