import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WorkspaceSession } from "../../workspace/manager/workspace-session.mjs";
import {
  WorkspaceValidationError,
  validateWorkspaceSelection,
} from "../../workspace/validation/workspace-validator.mjs";

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-sandbox-"));
  const localRoot = path.join(base, "local");
  const smbRoot = path.join(base, "smb");
  const projectA = path.join(localRoot, "Project-A");
  const projectB = path.join(localRoot, "Project-B");
  const smbA = path.join(smbRoot, "Project-SMB-A");
  const smbB = path.join(smbRoot, "Project-SMB-B");
  for (const dir of [projectA, projectB, smbA, smbB]) fs.mkdirSync(dir, { recursive: true });
  return { base, localRoot, smbRoot, projectA, projectB, smbA, smbB };
}

function localSession(data) {
  return new WorkspaceSession({
    workspacePath: data.projectA,
    storageType: "local",
    allowedRoots: [{ type: "local", path: data.localRoot }],
  });
}

test("Sandbox: Workspace内のread/write/delete対象を許可する", () => {
  const data = fixture();
  const session = localSession(data);
  fs.writeFileSync(path.join(data.projectA, "existing.txt"), "ok");
  assert.equal(session.authorize("existing.txt", "read"), path.join(data.projectA, "existing.txt"));
  assert.equal(session.authorize("new.txt", "write"), path.join(data.projectA, "new.txt"));
  assert.equal(session.authorize("existing.txt", "delete"), path.join(data.projectA, "existing.txt"));
});
test("Sandbox: ../ による脱出を拒否する", () => {
  const data = fixture();
  assert.throws(() => localSession(data).authorize("../Project-B/file.txt"), { code: "PATH_TRAVERSAL" });
});

test("Sandbox: symlinkによるWorkspace外脱出を拒否する", (t) => {
  const data = fixture();
  const outside = path.join(data.base, "outside");
  fs.mkdirSync(outside);
  try {
    fs.symlinkSync(outside, path.join(data.projectA, "escape"), "dir");
  } catch {
    t.skip("symlinkを作成できない環境です");
    return;
  }
  assert.throws(() => localSession(data).authorize("escape/file.txt", "write"), {
    code: "OUTSIDE_WORKSPACE",
  });
});

test("Sandbox: 別Projectへの絶対パスアクセスを拒否する", () => {
  const data = fixture();
  assert.throws(() => localSession(data).authorize(path.join(data.projectB, "file.txt")), {
    code: "OUTSIDE_WORKSPACE",
  });
});

test("Sandbox: Storage Root全体と存在しないWorkspaceを拒否する", () => {
  const data = fixture();
  const options = { storageType: "local", allowedRoots: [{ type: "local", path: data.localRoot }] };
  assert.throws(() => validateWorkspaceSelection({ ...options, workspacePath: data.localRoot }), {
    code: "STORAGE_ROOT_SELECTED",
  });
  assert.throws(
    () => validateWorkspaceSelection({ ...options, workspacePath: path.join(data.localRoot, "missing") }),
    { code: "NOT_FOUND" },
  );
});

test("Sandbox: 許可Root外と危険な広域Rootを拒否する", () => {
  const data = fixture();
  assert.throws(
    () =>
      validateWorkspaceSelection({
        workspacePath: data.projectA,
        storageType: "local",
        allowedRoots: [{ type: "local", path: data.base }],
      }),
    { code: "OUTSIDE_ALLOWED_ROOT" },
  );
  const filesystemRoot = path.parse(data.base).root;
  assert.throws(
    () =>
      validateWorkspaceSelection({
        workspacePath: data.projectA,
        storageType: "local",
        allowedRoots: [{ type: "local", path: filesystemRoot }],
      }),
    (error) =>
      error instanceof WorkspaceValidationError &&
      ["DANGEROUS_ROOT", "OUTSIDE_ALLOWED_ROOT"].includes(error.code),
  );
});

test("Sandbox: SMBは既存mount検証成功時だけ選択し、別Projectを拒否する", () => {
  const data = fixture();
  const options = {
    workspacePath: data.smbA,
    storageType: "smb",
    allowedRoots: [{ type: "smb", path: data.smbRoot }],
  };
  assert.throws(() => validateWorkspaceSelection({ ...options, mountChecker: () => false }), {
    code: "SMB_NOT_MOUNTED_OR_OUTSIDE",
  });
  const session = new WorkspaceSession({ ...options, mountChecker: () => true });
  assert.equal(session.storageType, "smb");
  assert.throws(() => session.authorize(path.join(data.smbB, "file.txt")), {
    code: "OUTSIDE_WORKSPACE",
  });
});
