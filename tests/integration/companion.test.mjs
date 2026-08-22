import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCompanionServer, loadCompanionConfig, openCodeConfig } from "../../companion/src/companion.mjs";

let nextPort = 47831;

async function withCompanion(callback, dependencies = {}) {
  const port = nextPort++;
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-companion-"));
  const config = loadCompanionConfig({ DEEPSEEK_COMPANION_PORT: String(port), DEEPSEEK_COMPANION_STATE_DIR: stateDir });
  const app = createCompanionServer(config, { token: "test-pairing-token-1234567890", ...dependencies });
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  try { await callback(`http://127.0.0.1:${port}`, app); }
  finally { await new Promise((resolve) => app.server.close(resolve)); }
}

const auth = { "content-type": "application/json", "x-companion-token": "test-pairing-token-1234567890" };

test("Companion OpenCode設定は全ProfileをDeepSeek-onlyへ固定する", () => {
  for (const profile of ["safe", "development", "autonomous", "deep-debug"]) {
    const config = openCodeConfig(profile);
    assert.deepEqual(config.enabled_providers, ["deepseek"]);
    assert.match(config.model, /^deepseek\//);
    assert.equal(config.permission.external_directory, "deny");
    assert.deepEqual(config.plugin, ["oh-my-opencode@4.19.4"]);
  }
});

test("Companion healthは秘密値なしで応答し、操作APIはpairing tokenを要求する", async () => {
  await withCompanion(async (base) => {
    const health = await (await fetch(`${base}/v1/health`)).json();
    assert.equal(health.ok, true);
    assert.doesNotMatch(JSON.stringify(health), /test-pairing-token/);
    assert.equal((await fetch(`${base}/v1/workspaces/pick`, { method: "POST" })).status, 401);
  });
});

test("Companionは許可OriginだけにPNA/CORSを返す", async () => {
  await withCompanion(async (base) => {
    const allowed = await fetch(`${base}/v1/health`, { method: "OPTIONS", headers: {
      origin: "https://ai-coding.mirai-dx-platform.com",
      "access-control-request-method": "GET",
      "access-control-request-private-network": "true",
    } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-private-network"), "true");
    const denied = await fetch(`${base}/v1/health`, { headers: { origin: "https://evil.example" } });
    assert.equal(denied.status, 403);
  });
});

test("Localフォルダ選択はcanonical workspace idだけをブラウザへ返す", async () => {
  const selected = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-selected-"));
  fs.mkdirSync(path.join(selected, ".git"));
  await withCompanion(async (base, app) => {
    const response = await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.workspace.path, fs.realpathSync(selected));
    assert.equal(body.workspace.git, true);
    assert.equal(app.workspaces.size, 1);
  }, { pickFolder: () => selected });
});

test("SMBはpassword受領を拒否し、接続先形式を検査する", async () => {
  await withCompanion(async (base) => {
    const password = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server", share: "work", password: "do-not-store" }) });
    assert.equal(password.status, 400);
    const invalid = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server/escape", share: "work" }) });
    assert.equal(invalid.status, 400);
  }, { openSmb: (body) => {
    if (body.host.includes("/")) throw new Error("invalid host");
    return { uri: "smb://server/work", credentialUi: "test" };
  } });
});

test("SessionはOpenCode exact versionを要求し、資格情報をレスポンスへ含めない", async () => {
  const selected = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-session-"));
  let launched = "";
  await withCompanion(async (base) => {
    const picked = await (await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" })).json();
    const response = await fetch(`${base}/v1/sessions/launch`, { method: "POST", headers: auth, body: JSON.stringify({ workspaceId: picked.workspace.id, profile: "safe", deepseekApiKey: "test-deepseek-secret" }) });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.ok(launched);
    assert.doesNotMatch(JSON.stringify(body), /test-deepseek-secret/);
  }, { pickFolder: () => selected, inspectOpenCode: () => ({ version: "1.18.21", binary: process.execPath }), launchTerminal: (id) => { launched = id; } });
});

test("Session claimはpairing token必須かつ一回だけ資格情報を引き渡す", async () => {
  const selected = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-claim-"));
  let launched = "";
  await withCompanion(async (base) => {
    const picked = await (await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" })).json();
    await fetch(`${base}/v1/sessions/launch`, { method: "POST", headers: auth, body: JSON.stringify({ workspaceId: picked.workspace.id, profile: "safe", deepseekApiKey: "one-time-secret" }) });
    assert.equal((await fetch(`${base}/v1/sessions/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: launched }) })).status, 401);
    const first = await fetch(`${base}/v1/sessions/claim`, { method: "POST", headers: auth, body: JSON.stringify({ sessionId: launched }) });
    const claim = await first.json();
    assert.equal(first.status, 200);
    assert.equal(claim.deepseekApiKey, "one-time-secret");
    assert.equal(claim.binary, process.execPath);
    assert.equal((await fetch(`${base}/v1/sessions/claim`, { method: "POST", headers: auth, body: JSON.stringify({ sessionId: launched }) })).status, 404);
  }, { pickFolder: () => selected, inspectOpenCode: () => ({ version: "1.18.21", binary: process.execPath }), launchTerminal: (id) => { launched = id; } });
});
