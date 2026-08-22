import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildBubblewrapArgs } from "../../sandbox/linux/bubblewrap.mjs";

test("Sandbox: bubblewrapはWorkspaceだけをbindし、既定でnetworkと環境を分離する", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-bwrap-"));
  fs.writeFileSync(path.join(workspace, ".env"), "DEEPSEEK_API_KEY=secret");
  fs.mkdirSync(path.join(workspace, ".ssh"));
  const args = buildBubblewrapArgs({ workspace, command: ["npm", "test"] });
  assert.ok(args.includes("--unshare-all"));
  assert.ok(!args.includes("--share-net"));
  assert.ok(args.includes("--clearenv"));
  assert.deepEqual(args.slice(args.indexOf("--bind"), args.indexOf("--bind") + 3), [
    "--bind",
    workspace,
    "/workspace",
  ]);
  assert.deepEqual(args.slice(-3), ["--", "npm", "test"]);
  const flattened = args.join(" ");
  assert.match(flattened, /--ro-bind \/dev\/null \/workspace\/\.env/u);
  assert.match(flattened, /--tmpfs \/workspace\/\.ssh/u);
});
