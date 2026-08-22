import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateCommand } from "../../sandbox/validation/command-policy.mjs";
import { WorkspaceSession } from "../../workspace/manager/workspace-session.mjs";

function sessionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-security-"));
  const project = path.join(root, "Project-A");
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  const session = new WorkspaceSession({
    workspacePath: project,
    storageType: "local",
    allowedRoots: [{ type: "local", path: root }],
  });
  return { root, project, session };
}

test("Security: .env、秘密鍵、credential、Workspace内.sshもread拒否する", () => {
  const { session } = sessionFixture();
  for (const secret of [".env", ".env.local", "server.pem", "private.key", "id_rsa", "credentials.json", "secret-token.txt", ".ssh/config"]) {
    assert.throws(() => session.authorize(secret, "read"), { code: "SECRET_PATH" });
  }
});

test("Security: /etc、/root、ユーザー.sshへの絶対パスアクセスを拒否する", () => {
  const { session } = sessionFixture();
  for (const target of ["/etc/passwd", "/root/.ssh/id_rsa", "/home/example/.ssh/config"]) {
    assert.throws(
      () => session.authorize(target, "read"),
      (error) => ["OUTSIDE_WORKSPACE", "SECRET_PATH"].includes(error.code),
    );
  }
});

test("Security: sudo、mount、systemctl、rmをfail-closedで拒否する", () => {
  const { session, project } = sessionFixture();
  for (const command of [["sudo", "npm", "test"], ["mount", "/dev/sda1", "/mnt/x"], ["systemctl", "restart", "ssh"], ["rm", "-rf", "/"]]) {
    assert.throws(() => validateCommand(command, { session, cwd: project }), {
      code: "FORBIDDEN_COMMAND",
    });
  }
});

test("Security: shell文字列、未知コマンド、動的eval、Workspace外cwdを拒否する", () => {
  const { root, project, session } = sessionFixture();
  assert.throws(() => validateCommand("npm test", { session, cwd: project }), { code: "ARGV_REQUIRED" });
  assert.throws(() => validateCommand(["curl", "https://example.invalid"], { session, cwd: project }), {
    code: "COMMAND_NOT_ALLOWED",
  });
  assert.throws(() => validateCommand(["./npm", "test"], { session, cwd: project }), {
    code: "EXECUTABLE_PATH",
  });
  assert.throws(() => validateCommand(["node", "--eval", "process.exit()"], { session, cwd: project }), {
    code: "DYNAMIC_CODE",
  });
  assert.throws(() => validateCommand(["npm", "test"], { session, cwd: root }), {
    code: "OUTSIDE_WORKSPACE",
  });
});

test("Security: 許可コマンドは固定argvとWorkspace内cwdとして返す", () => {
  const { project, session } = sessionFixture();
  const result = validateCommand(["npm", "test"], { session, cwd: "src" });
  assert.deepEqual(result.argv, ["npm", "test"]);
  assert.equal(result.cwd, path.join(project, "src"));
  assert.equal(Object.isFrozen(result.argv), true);
});
