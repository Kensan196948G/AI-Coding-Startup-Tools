import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  basenameOfPath,
  isInsideAnyRoot,
  isInsideAnyWindowsRoot,
  isInsideRoot,
  isInsideWindowsRoot,
  isProjectDir,
  isSafeWindowsPath,
  listProjects,
  listProjectsForRoots,
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

test("UT-SAFEWINPATH-001: 通常の Windows パスを許可する", () => {
  assert.equal(isSafeWindowsPath("C:\\projects\\foo"), true);
  assert.equal(isSafeWindowsPath("D:\\projects\\My Project-1.2"), true);
});

test("UT-SAFEWINPATH-002: シェル/PowerShell メタ文字を含むパスを拒否する", () => {
  assert.equal(isSafeWindowsPath('C:\\projects\\foo" ; calc.exe #'), false);
  assert.equal(isSafeWindowsPath("C:\\projects\\foo`whoami`"), false);
  assert.equal(isSafeWindowsPath("C:\\projects\\foo$(whoami)"), false);
  assert.equal(isSafeWindowsPath("C:\\projects\\foo|calc"), false);
  assert.equal(isSafeWindowsPath("C:\\projects\\foo\ncalc"), false);
  assert.equal(isSafeWindowsPath("C:\\projects\\foo%TEMP%"), false);
});

test("UT-SAFEWINPATH-003: 非文字列や空文字を拒否する", () => {
  assert.equal(isSafeWindowsPath(""), false);
  assert.equal(isSafeWindowsPath(undefined), false);
});

test("basenameOfPath は Linux パス・Windows パスどちらも末尾セグメントを返す", () => {
  assert.equal(basenameOfPath("/home/user/Mirai-Project"), "Mirai-Project");
  assert.equal(basenameOfPath("D:\\Mirai-DX-Project"), "Mirai-DX-Project");
  assert.equal(basenameOfPath("/home/user/Mirai-Project/"), "Mirai-Project");
  assert.equal(basenameOfPath("plainname"), "plainname");
});

test("isInsideAnyRoot は複数ルートのいずれか配下なら許可する", () => {
  const rootA = makeRoot();
  const rootB = makeRoot();
  assert.equal(isInsideAnyRoot([rootA, rootB], path.join(rootA, "sample")), true);
  assert.equal(isInsideAnyRoot([rootA, rootB], path.join(rootB, "sample")), true);
  assert.equal(isInsideAnyRoot([rootA, rootB], path.join(os.tmpdir(), "elsewhere")), false);
});

test("isInsideAnyWindowsRoot は複数ルートのいずれか配下なら大文字小文字・区切り文字を無視して許可する", () => {
  const roots = ["C:\\Mirai-Project", "D:\\Mirai-DX-Project"];
  assert.equal(isInsideAnyWindowsRoot(roots, "d:/Mirai-DX-Project/foo"), true);
  assert.equal(isInsideAnyWindowsRoot(roots, "C:\\Mirai-Project\\bar"), true);
  assert.equal(isInsideAnyWindowsRoot(roots, "E:\\Other\\foo"), false);
});

test("listProjectsForRoots は各ルートをラベル付きで判定基準Cにより列挙する", () => {
  const rootA = makeRoot();
  const rootB = makeRoot();
  fs.mkdirSync(path.join(rootA, "good", ".git"), { recursive: true });
  fs.mkdirSync(path.join(rootA, "good", ".ai-startup-tools"), { recursive: true });
  fs.mkdirSync(path.join(rootB, "plain"), { recursive: true });

  const result = listProjectsForRoots([rootA, rootB]);
  assert.equal(result.length, 2);
  assert.equal(result[0].root, rootA);
  assert.equal(result[0].label, path.basename(rootA));
  assert.equal(result[0].projects.length, 1);
  assert.equal(result[0].projects[0].name, "good");
  assert.equal(result[1].root, rootB);
  assert.equal(result[1].projects.length, 0);
});
