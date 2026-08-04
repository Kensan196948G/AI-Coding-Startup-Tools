import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createApp, loadConfig } from "../../webui/server.mjs";

function makeProjectsRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-webui-api-"));
  fs.mkdirSync(path.join(root, "sample", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "sample", ".ai-startup-tools"), { recursive: true });
  fs.mkdirSync(path.join(root, "plain", ".git"), { recursive: true });
  return root;
}

async function startApp(env) {
  const config = loadConfig({
    ...process.env,
    AI_WEBUI_PORT: "0",
    ...env,
  });
  const server = createApp(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test("GET /api/health が設定情報を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.config.projectsRootsLinux, [root]);
  server.close();
});

test("GET /api/linux/projects が Git リポジトリを列挙し bootstrap 状態を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/linux/projects`);
  const data = await res.json();
  assert.equal(data.roots.length, 1);
  assert.equal(data.roots[0].root, root);
  assert.equal(data.roots[0].projects.length, 2);
  const sample = data.roots[0].projects.find((p) => p.name === "sample");
  const plain = data.roots[0].projects.find((p) => p.name === "plain");
  assert.equal(sample.bootstrapped, true);
  assert.equal(plain.bootstrapped, false);
  server.close();
});

test("GET /api/linux/projects はカンマ区切りの複数ルートをそれぞれ列挙する", async () => {
  const rootA = makeProjectsRoot();
  const rootB = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: `${rootA},${rootB}`,
  });
  const res = await fetch(`${base}/api/linux/projects`);
  const data = await res.json();
  assert.equal(data.roots.length, 2);
  assert.equal(data.roots[0].root, rootA);
  assert.equal(data.roots[0].projects.length, 2);
  assert.equal(data.roots[1].root, rootB);
  assert.equal(data.roots[1].projects.length, 2);
  server.close();
});

test("POST /api/linux/action は2番目のルート配下のパスも許可する", async () => {
  const rootA = makeProjectsRoot();
  const rootB = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: `${rootA},${rootB}`,
  });
  const res = await fetch(`${base}/api/linux/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "diagnose", projectPath: path.join(rootB, "sample") }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.exitCode, 0);
  server.close();
});

test("POST /api/linux/action は複数ルート設定時も全ルート外のパスを拒否する (403)", async () => {
  const rootA = makeProjectsRoot();
  const rootB = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: `${rootA},${rootB}`,
  });
  const res = await fetch(`${base}/api/linux/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "diagnose", projectPath: os.tmpdir() }),
  });
  assert.equal(res.status, 403);
  server.close();
});

test("POST /api/linux/action はルート外パスを拒否する (403)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/linux/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "diagnose", projectPath: os.tmpdir() }),
  });
  assert.equal(res.status, 403);
  server.close();
});

test("POST /api/linux/template はルート外パスを拒否する (403)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/linux/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template: "requirements",
      projectPath: os.tmpdir(),
      vars: { PROJECT_NAME: "Demo", PROJECT_SLUG: "demo" },
    }),
  });
  assert.equal(res.status, 403);
  server.close();
});

test("POST /api/linux/template は2番目のルート配下のパスも許可する", async () => {
  const rootA = makeProjectsRoot();
  const rootB = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: `${rootA},${rootB}`,
  });
  const res = await fetch(`${base}/api/linux/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template: "requirements",
      projectPath: path.join(rootB, "sample"),
      vars: { PROJECT_NAME: "Demo", PROJECT_SLUG: "demo" },
    }),
  });
  assert.equal(res.status, 200);
  server.close();
});

test("POST /api/linux/template は不明なテンプレートと必須変数不足を拒否する (400)", async () => {
  const root = makeProjectsRoot();
  const projectPath = path.join(root, "sample");
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });

  const badTemplate = await fetch(`${base}/api/linux/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: "unknown", projectPath, vars: { PROJECT_NAME: "D", PROJECT_SLUG: "d" } }),
  });
  assert.equal(badTemplate.status, 400);

  const missingVars = await fetch(`${base}/api/linux/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: "requirements", projectPath, vars: {} }),
  });
  assert.equal(missingVars.status, 400);

  const badSlug = await fetch(`${base}/api/linux/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: "requirements", projectPath, vars: { PROJECT_NAME: "Demo", PROJECT_SLUG: "BAD SLUG" } }),
  });
  assert.equal(badSlug.status, 400);
  server.close();
});

test("IT-WINACTION-001: POST /api/windows/action はコマンドインジェクション文字を含む projectPath を拒否する (400)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_WINDOWS_HOST: "test-windows-host",
    AI_WEBUI_WINDOWS_PROJECTS_ROOT: "C:\\projects",
  });
  const res = await fetch(`${base}/api/windows/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "launch-check-claude",
      tool: "claude",
      projectPath: 'C:\\projects\\foo" ; calc.exe #',
    }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  server.close();
});

test("トークン設定時は未認証リクエストを拒否する (401)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root, AI_WEBUI_TOKEN: "secret" });
  const denied = await fetch(`${base}/api/linux/projects`);
  assert.equal(denied.status, 401);
  const ok = await fetch(`${base}/api/linux/projects`, { headers: { "x-auth-token": "secret" } });
  assert.equal(ok.status, 200);
  server.close();
});

test("GET / が HTML 画面を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("AI Coding Startup Tools"));
  server.close();
});

test("IT-WEBUI-SEC-001: 全レスポンスにセキュリティヘッダーが付与される", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/healthz`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(res.headers.get("cache-control") || "", /no-store/);
  server.close();
});

test("IT-WEBUI-SEC-002: /api/healthz はトークン設定時も認証なしで最小情報を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_TOKEN: "secret",
  });
  const res = await fetch(`${base}/api/healthz`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.config, undefined);
  server.close();
});

test("IT-WEBUI-SEC-003: トークン設定時は /api/health も認証が必要", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_TOKEN: "secret",
  });
  const denied = await fetch(`${base}/api/health`);
  assert.equal(denied.status, 401);
  const ok = await fetch(`${base}/api/health`, { headers: { "x-auth-token": "secret" } });
  assert.equal(ok.status, 200);
  server.close();
});

test("IT-WEBUI-SEC-004: レート制限を超えると 429 を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_RATE_LIMIT_PER_MINUTE: "2",
  });
  const first = await fetch(`${base}/api/linux/projects`);
  const second = await fetch(`${base}/api/linux/projects`);
  const third = await fetch(`${base}/api/linux/projects`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  server.close();
});

test("IT-WEBUI-SEC-005: 監査ログが JSONL 形式で出力される", async () => {
  const root = makeProjectsRoot();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-webui-audit-"));
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_LOG_DIR: logDir,
  });
  const res = await fetch(`${base}/api/healthz`);
  assert.equal(res.status, 200);
  const logFile = path.join(logDir, "webui-audit.jsonl");
  let lines = [];
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(logFile)) {
      lines = fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length > 0) break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(lines.length > 0, "監査ログが出力されること");
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.method, "GET");
  assert.equal(entry.path, "/api/healthz");
  assert.equal(entry.status, 200);
  assert.ok(entry.requestId);
  server.close();
});

test("IT-WEBUI-CFG-001: 不正なポート設定は起動時に拒否される", () => {
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_PORT: "99999" }),
    /AI_WEBUI_PORT/,
  );
});
