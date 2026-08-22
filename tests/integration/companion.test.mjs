import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildOpenCodeLaunch, createCompanionServer, isPathAtOrInside, loadCompanionConfig, openCodeConfig } from "../../companion/src/companion.mjs";

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
    assert.equal(typeof config.permission.bash === "string" ? config.permission.bash : config.permission.bash["*"], "ask");
    for (const unsafeAllow of ["node *", "python *", "npm run *", "git status*", "git add *"]) {
      if (typeof config.permission.bash === "object") assert.notEqual(config.permission.bash[unsafeAllow], "allow");
    }
  }
});

test("Windows/macOSのOS保護領域は子孫パスまで境界一致で判定する", () => {
  assert.equal(isPathAtOrInside("C:\\Windows\\System32", "C:\\Windows", "win32"), true);
  assert.equal(isPathAtOrInside("C:\\Windows-old", "C:\\Windows", "win32"), false);
  assert.equal(isPathAtOrInside("C:\\Program Files\\OpenCode", "C:\\Program Files", "win32"), true);
  assert.equal(isPathAtOrInside("/System/Library", "/System", "darwin"), true);
  assert.equal(isPathAtOrInside("/Systematic/project", "/System", "darwin"), false);
});

test("OpenCode起動specは他Provider資格情報とproxyを除去しshellを使わない", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-launch-spec-"));
  const binary = fs.realpathSync(process.execPath);
  const identity = (stat) => ({ dev: String(stat.dev), ino: String(stat.ino), birthtimeMs: Math.trunc(stat.birthtimeMs) });
  const config = loadCompanionConfig({ DEEPSEEK_COMPANION_STATE_DIR: path.join(workspace, ".state") });
  const launch = buildOpenCodeLaunch({
    binary, binaryIdentity: identity(fs.statSync(binary)), workspace,
    workspaceIdentity: identity(fs.statSync(workspace)), profile: "development", deepseekApiKey: "deepseek-only-secret",
  }, config, {
    PATH: process.env.PATH, OPENAI_API_KEY: "remove", GOOGLE_APPLICATION_CREDENTIALS: "remove",
    AWS_PROFILE: "remove", GH_TOKEN: "remove", NPM_TOKEN: "remove", HTTPS_PROXY: "remove",
  });
  assert.equal(launch.options.shell, false);
  assert.equal(launch.options.cwd, fs.realpathSync(workspace));
  assert.equal(launch.options.env.DEEPSEEK_API_KEY, "deepseek-only-secret");
  for (const key of ["OPENAI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AWS_PROFILE", "GH_TOKEN", "NPM_TOKEN", "HTTPS_PROXY"]) {
    assert.equal(launch.options.env[key], undefined, key);
  }
});

test("Companion healthは秘密値なしで応答し、操作APIはpairing tokenを要求する", async () => {
  await withCompanion(async (base) => {
    const health = await (await fetch(`${base}/v1/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.version, "1.0.6");
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
    const localhost = await fetch(`${base}/v1/health`, { headers: { origin: "http://localhost:8877" } });
    assert.equal(localhost.status, 403);
  });
});

test("許可Originはブラウザ用tokenを自動取得でき、Originなしと不正Originは拒否する", async () => {
  let clock = 10_000;
  await withCompanion(async (base) => {
    const withoutOrigin = await fetch(`${base}/v1/pair`, { method: "POST" });
    assert.equal(withoutOrigin.status, 403);
    const denied = await fetch(`${base}/v1/pair`, { method: "POST", headers: { origin: "https://evil.example" } });
    assert.equal(denied.status, 403);

    const origin = "https://ai-coding.mirai-dx-platform.com";
    const paired = await fetch(`${base}/v1/pair`, { method: "POST", headers: { origin } });
    const body = await paired.json();
    assert.equal(paired.status, 201);
    assert.equal(body.paired, true);
    assert.equal(typeof body.sessionToken, "string");
    assert.ok(body.sessionToken.length >= 32);

    const status = await fetch(`${base}/v1/status`, { headers: { origin, "x-companion-token": body.sessionToken } });
    assert.equal(status.status, 200);
    const wrongOrigin = await fetch(`${base}/v1/status`, { headers: { origin: "https://evil.example", "x-companion-token": body.sessionToken } });
    assert.equal(wrongOrigin.status, 403);

    clock += 8 * 60 * 60_000 + 1;
    const expired = await fetch(`${base}/v1/status`, { headers: { origin, "x-companion-token": body.sessionToken } });
    assert.equal(expired.status, 401);
  }, { now: () => clock });
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

test("Workspaceと同じパスが別ディレクトリへ差し替えられた場合はSession起動を拒否する", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-replaced-"));
  const selected = path.join(parent, "workspace");
  const original = path.join(parent, "workspace-original");
  fs.mkdirSync(selected);
  await withCompanion(async (base) => {
    const picked = await (await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" })).json();
    fs.renameSync(selected, original);
    fs.mkdirSync(selected);
    const response = await fetch(`${base}/v1/sessions/launch`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ workspaceId: picked.workspace.id, profile: "safe", deepseekApiKey: "test-deepseek-secret" }),
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /実体が選択後に変更/);
  }, { pickFolder: () => selected, inspectOpenCode: () => ({ version: "1.18.21", binary: process.execPath }) });
});

test("Workspaceがjunctionまたはsymlinkへ差し替えられた場合はSession起動を拒否する", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-link-swap-"));
  const selected = path.join(parent, "workspace");
  const original = path.join(parent, "workspace-original");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-link-outside-"));
  fs.mkdirSync(selected);
  await withCompanion(async (base) => {
    const picked = await (await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" })).json();
    fs.renameSync(selected, original);
    try { fs.symlinkSync(outside, selected, process.platform === "win32" ? "junction" : "dir"); }
    catch { t.skip("junction/symlink作成権限がありません"); return; }
    const response = await fetch(`${base}/v1/sessions/launch`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ workspaceId: picked.workspace.id, profile: "safe", deepseekApiKey: "test-deepseek-secret" }),
    });
    assert.equal(response.status, 409);
  }, { pickFolder: () => selected, inspectOpenCode: () => ({ version: "1.18.21", binary: process.execPath }) });
});

test("Companion stateとpairing tokenのsymlinkを拒否する", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-state-link-"));
  const realState = path.join(parent, "real-state");
  const linkedState = path.join(parent, "linked-state");
  fs.mkdirSync(realState);
  try { fs.symlinkSync(realState, linkedState, process.platform === "win32" ? "junction" : "dir"); }
  catch { t.skip("junction/symlink作成権限がありません"); return; }
  const linkedConfig = loadCompanionConfig({ DEEPSEEK_COMPANION_STATE_DIR: linkedState });
  assert.throws(() => createCompanionServer(linkedConfig), /real directory/);

  const stateDir = path.join(parent, "state");
  const externalToken = path.join(parent, "external-token");
  fs.mkdirSync(stateDir);
  fs.writeFileSync(externalToken, "external-pairing-token-1234567890\n");
  try { fs.symlinkSync(externalToken, path.join(stateDir, "pairing-token"), "file"); }
  catch { t.skip("file symlink作成権限がありません"); return; }
  const tokenConfig = loadCompanionConfig({ DEEPSEEK_COMPANION_STATE_DIR: stateDir });
  assert.throws(() => createCompanionServer(tokenConfig), /regular file/);
});

test("SMBはユーザー名とpasswordを必須化し、秘密値を応答へ含めない", async () => {
  let smbBodyRef;
  await withCompanion(async (base) => {
    const missingUser = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server", share: "work", password: "do-not-store" }) });
    assert.equal(missingUser.status, 400);
    const nestedPassword = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server", share: "work", credentials: { password: "do-not-store" } }) });
    assert.equal(nestedPassword.status, 400);
    const unknown = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server", share: "work", remember: true }) });
    assert.equal(unknown.status, 400);
    const invalid = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server/escape", share: "work" }) });
    assert.equal(invalid.status, 400);
    const connected = await fetch(`${base}/v1/smb/open`, { method: "POST", headers: auth, body: JSON.stringify({ host: "server", share: "work", user: "domain\\user", password: "do-not-store" }) });
    const result = await connected.json();
    assert.equal(connected.status, 200);
    assert.doesNotMatch(JSON.stringify(result), /do-not-store/);
    assert.equal(smbBodyRef.password, "");
  }, { openSmb: (body) => {
    smbBodyRef = body;
    assert.equal(body.user, "domain\\user");
    assert.equal(body.password, "do-not-store");
    return { uri: "smb://server/work", credentialUi: "test" };
  } });
});

test("Workspace選択は30分で期限切れになり、保持数を32件に制限する", async () => {
  const selected = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-expiry-"));
  let clock = 1_000;
  await withCompanion(async (base, app) => {
    let firstId = "";
    for (let index = 0; index < 33; index += 1) {
      const picked = await (await fetch(`${base}/v1/workspaces/pick`, { method: "POST", headers: auth, body: "{}" })).json();
      if (index === 0) firstId = picked.workspace.id;
    }
    assert.equal(app.workspaces.size, 32);
    assert.equal(app.workspaces.has(firstId), false);
    const activeId = [...app.workspaces.keys()][0];
    clock += 30 * 60_000 + 1;
    const expired = await fetch(`${base}/v1/sessions/launch`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ workspaceId: activeId, profile: "safe", deepseekApiKey: "test-deepseek-secret" }),
    });
    assert.equal(expired.status, 410);
  }, { pickFolder: () => selected, now: () => clock });
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

test("通常起動ログは永続pairing tokenを表示しない", () => {
  const source = fs.readFileSync(new URL("../../companion/src/companion.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Pairing token:/);
  assert.match(source, /recovery-token/);
  assert.match(source, /通常はtoken入力不要です/);
});
