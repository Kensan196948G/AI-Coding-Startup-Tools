import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { buildSessionSpec, createApp, loadConfig } from "../../webui/server.mjs";

async function withServer(config, callback) {
  const server = createApp(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-webui-"));
  const local = path.join(base, "local");
  const smb = path.join(base, "smb");
  const project = path.join(local, "project-a");
  fs.mkdirSync(path.join(project, ".git"), { recursive: true });
  fs.mkdirSync(smb);
  const logDir = path.join(base, "logs");
  return { base, local, smb, project, logDir };
}

function configFor(f, extra = {}) {
  return loadConfig({
    NODE_ENV: "test",
    DEEPSEEK_WEBUI_PORT: "0",
    DEEPSEEK_LOCAL_ROOTS: f.local,
    DEEPSEEK_SMB_ROOTS: f.smb,
    DEEPSEEK_AUDIT_LOG_DIR: f.logDir,
    ...extra,
  });
}

test("非ループバック待受はtokenなしでfail-closedになる", () => {
  assert.throws(() => loadConfig({ DEEPSEEK_WEBUI_HOST: "0.0.0.0" }), /TOKEN/);
});

test("Local/SMB RootとDeepSeek監査ログを読込む", () => {
  const f = fixture();
  const cfg = configFor(f);
  assert.deepEqual(cfg.projectsRootsLocal, [f.local]);
  assert.deepEqual(cfg.projectsRootsSmb, [f.smb]);
  assert.match(cfg.logDir, /logs$/);
});

test("DeepSeek資格情報は設定有無だけを公開し、configの列挙やsession specへ値を含めない", () => {
  const f = fixture();
  const cfg = configFor(f, { DEEPSEEK_API_KEY: "test-secret-value" });
  assert.equal(cfg.credentialConfigured, true);
  assert.doesNotMatch(JSON.stringify(cfg), /test-secret-value/);
  const spec = buildSessionSpec(cfg, {
    projectPath: f.project, profile: "safe", completionCriteria: "tests pass",
  });
  assert.doesNotMatch(JSON.stringify(spec), /test-secret-value/);
});

test("buildSessionSpecはOpenCode launchだけを組み立てる", () => {
  const f = fixture();
  const cfg = configFor(f);
  const spec = buildSessionSpec(cfg, {
    target: "Linux", tool: "opencode", projectPath: f.project,
    profile: "development", completionCriteria: "tests pass",
  });
  assert.deepEqual(spec.command.slice(-4), ["--workspace", f.project, "--profile", "development"]);
  assert.equal(spec.cwd, f.project);
  assert.equal(spec.env.DEEPSEEK_SESSION_MODE, "development");
});

test("GET /api/healthはDeepSeek-only設定を返す", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.config.enabledProvider, "deepseek");
    assert.equal(body.config.credentialConfigured, false);
    assert.deepEqual(body.config.localRoots, [f.local]);
  });
});

test("資格情報未設定では有効なSession作成をfail-closedで拒否する", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Linux", tool: "opencode", profile: "safe", projectPath: f.project }),
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /API_KEY=/);
  });
});

test("Session資格情報は一回だけ受け取り、応答・history・auditへ残さない", async () => {
  const f = fixture();
  const secret = "sk-test-ephemeral-secret";
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "Linux", tool: "opencode", profile: "safe", projectPath: f.project,
        deepseekApiKey: secret,
      }),
    });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), new RegExp(secret));
    for (const endpoint of ["history", "audit"]) {
      const text = await (await fetch(`${base}/api/${endpoint}`)).text();
      assert.doesNotMatch(text, new RegExp(secret), endpoint);
    }
  });
});

test("settings/agents/sandbox/history/auditは秘密値を返さない", async () => {
  const f = fixture();
  await withServer(configFor(f, { DEEPSEEK_API_KEY: "never-return-this" }), async (base) => {
    for (const endpoint of ["settings", "agents", "sandbox", "history", "audit"]) {
      const response = await fetch(`${base}/api/${endpoint}`);
      assert.equal(response.status, 200, endpoint);
      const text = await response.text();
      assert.doesNotMatch(text, /never-return-this/, endpoint);
    }
    const settings = await (await fetch(`${base}/api/settings`)).json();
    assert.deepEqual(settings.credential, {
      environmentVariable: "DEEPSEEK_API_KEY",
      configured: true,
      acceptsEphemeralSessionCredential: true,
    });
    const agents = await (await fetch(`${base}/api/agents`)).json();
    assert.equal(agents.provider, "deepseek");
    assert.equal(agents.fallbackEnabled, false);
    assert.ok(agents.agents.length > 0);
  });
});

test("GET /api/linux/projectsはLocalとSMBを分離する", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const body = await (await fetch(`${base}/api/linux/projects`)).json();
    assert.equal(body.storage.local[0].projects[0].name, "project-a");
    assert.equal(body.storage.smb[0].projects.length, 0);
  });
});

test("POST /api/sessionはOpenCode以外を拒否する", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Linux", tool: "other", projectPath: f.project }),
    });
    assert.equal(response.status, 400);
  });
});

test("POST /api/sessionは未知profileを拒否する", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Linux", tool: "opencode", profile: "unbounded", projectPath: f.project }),
    });
    assert.equal(response.status, 400);
  });
});

test("POST /api/sessionはRoot外Workspaceを拒否する", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Linux", tool: "opencode", projectPath: f.base, profile: "safe" }),
    });
    assert.equal(response.status, 403);
  });
});

test("token設定時はAPIを認証する", async () => {
  const f = fixture();
  await withServer(configFor(f, { DEEPSEEK_WEBUI_TOKEN: "test-token" }), async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 401);
    assert.equal((await fetch(`${base}/api/health`, { headers: { "x-auth-token": "test-token" } })).status, 200);
  });
});

test("静的HTMLは新名称・外部fontなし・inline handlerなし", async () => {
  const f = fixture();
  await withServer(configFor(f), async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    const app = await (await fetch(`${base}/app.js`)).text();
    assert.match(html, /DeepSeek Coding Tools/);
    assert.doesNotMatch(html, /fonts\.googleapis|on(click|change)=/i);
    assert.match(app, /sessionStorage\.getItem\('dct-ds-key'\)/);
    assert.match(app, /deepseekApiKey:state\.dsKey/);
    assert.doesNotMatch(app, /localStorage\.setItem\('dct-ds-key'/);
  });
});

test("GET /api/git/statusは選択Workspaceのbranchとstatusだけを返す", async () => {
  const f = fixture();
  fs.rmSync(path.join(f.project, ".git"), { recursive: true });
  assert.equal(spawnSync("git", ["init", "-b", "auto/test", f.project]).status, 0);
  fs.writeFileSync(path.join(f.project, "README.md"), "fixture\n", "utf8");
  await withServer(configFor(f), async (base) => {
    const response = await fetch(`${base}/api/git/status?projectPath=${encodeURIComponent(f.project)}`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.branch, "auto/test");
    assert.match(body.status, /README\.md/);
  });
});

test("Git actionはRoot外とmain branchのcommitをfail-closedで拒否する", async () => {
  const f = fixture();
  fs.rmSync(path.join(f.project, ".git"), { recursive: true });
  assert.equal(spawnSync("git", ["init", "-b", "main", f.project]).status, 0);
  await withServer(configFor(f), async (base) => {
    const outside = await fetch(`${base}/api/git/action`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: f.base, action: "diff" }),
    });
    assert.equal(outside.status, 403);
    const protectedBranch = await fetch(`${base}/api/git/action`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: f.project, action: "commit", message: "docs: test" }),
    });
    assert.equal(protectedBranch.status, 409);
  });
});
