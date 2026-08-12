import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionSpec, createApp, loadConfig } from "../../webui/server.mjs";
import {
  FrameDecoder,
  parseClosePayload,
} from "../../webui/lib/websocket.mjs";

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

function clientTextFrame(text) {
  const payload = Buffer.from(String(text), "utf8");
  const mask = [0x11, 0x22, 0x33, 0x44];
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) {
    masked[i] ^= mask[i & 3];
  }
  return Buffer.concat([
    Buffer.from([0x81, 0x80 | payload.length]),
    Buffer.from(mask),
    masked,
  ]);
}

function openWs(base, pathname, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    const req = http.request({
      host: url.hostname,
      port: url.port,
      path: pathname,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
        ...extraHeaders,
      },
    });
    req.on("upgrade", (_res, socket, head) => resolve({ socket, head }));
    req.on("response", (res) => resolve({ response: res }));
    req.on("error", reject);
    req.end();
  });
}

function createWsReader(socket, head) {
  const decoder = new FrameDecoder({ requireMasked: false });
  const queue = [];
  const waiters = [];
  if (head && head.length) {
    for (const message of decoder.push(head)) {
      queue.push(message);
    }
  }
  socket.on("data", (chunk) => {
    for (const message of decoder.push(chunk)) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(message);
      } else {
        queue.push(message);
      }
    }
  });
  socket.on("close", () => {
    const error = new Error("WebSocket が閉じました");
    for (const waiter of waiters.splice(0)) {
      waiter.reject(error);
    }
  });
  return () =>
    new Promise((resolve, reject) => {
      if (queue.length) {
        resolve(queue.shift());
        return;
      }
      waiters.push({ resolve, reject });
    });
}

test("GET /api/health が設定情報を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.config.projectsRootsLinux, [root]);
  assert.equal(typeof data.config.toolkitRoot, "string");
  assert.equal(data.config.windowsUser, undefined);
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
  assert.ok(html.includes('src="vendor/xterm/xterm.js"'));
  server.close();
});

test("GET /app.js がフロントエンド本体を配信する", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /javascript/);
  const text = await res.text();
  assert.ok(text.includes("window.App = App"));
  server.close();
});

test("GET /vendor/ は同梱アセットを配信しパストラバーサルを拒否する", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const js = await fetch(`${base}/vendor/xterm/xterm.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") || "", /javascript/);
  const text = await js.text();
  assert.ok(text.length > 1000);

  const traversal = await fetch(`${base}/vendor/..%2f..%2fserver.mjs`);
  assert.equal(traversal.status, 404);
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
  assert.doesNotMatch(res.headers.get("content-security-policy") || "", /script-src[^;]*'unsafe-inline'/);
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

test("IT-WEBUI-CFG-002: 非ループバック待受 + トークン未設定は起動時に拒否される (fail-closed)", () => {
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_HOST: "0.0.0.0" }),
    /AI_WEBUI_TOKEN/,
  );
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_HOST: "192.168.1.10" }),
    /AI_WEBUI_TOKEN/,
  );
});

test("IT-WEBUI-CFG-003: 非ループバック待受でもトークン設定時は起動できる", () => {
  const cfg = loadConfig({ ...process.env, AI_WEBUI_HOST: "0.0.0.0", AI_WEBUI_TOKEN: "secret" });
  assert.equal(cfg.host, "0.0.0.0");
  assert.equal(cfg.token, "secret");
});

test("IT-WEBUI-CFG-004: ループバック待受はトークンなしで起動できる", () => {
  const cfg = loadConfig({ ...process.env, AI_WEBUI_HOST: "127.0.0.1" });
  assert.equal(cfg.host, "127.0.0.1");
});

test("IT-WEBUI-CFG-005: 不正な Windows SSH ホスト・ユーザーは起動時に拒否される", () => {
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_WINDOWS_HOST: "-oProxyCommand=evil" }),
    /AI_WEBUI_WINDOWS_HOST/,
  );
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_WINDOWS_HOST: "host with space" }),
    /AI_WEBUI_WINDOWS_HOST/,
  );
  assert.throws(
    () => loadConfig({ ...process.env, AI_WEBUI_WINDOWS_USER: "user$(calc)" }),
    /AI_WEBUI_WINDOWS_USER/,
  );
});

test("POST /api/session は不正な target / tool を拒否する (400)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const projectPath = path.join(root, "sample");

  const badTarget = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "Mac", projectPath, tool: "claude" }),
  });
  assert.equal(badTarget.status, 400);

  const badTool = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "Linux", projectPath, tool: "vim" }),
  });
  assert.equal(badTool.status, 400);
  server.close();
});

test("buildSessionSpec は Codex (Linux) を既定では YOLO モードにしない", () => {
  const cfg = loadConfig({ AI_WEBUI_PROJECTS_ROOT_LINUX: "/tmp" });
  const spec = buildSessionSpec(cfg, {
    target: "Linux",
    tool: "codex",
    projectPath: "/tmp/sample",
    completionCriteria: "テスト",
  });
  assert.ok(!spec.command.includes("--allow-dangerous"));
  assert.ok(spec.command.includes("--yes"));
  assert.equal(spec.cwd, cfg.toolkitRoot);
});

test("buildSessionSpec は AI_WEBUI_ALLOW_DANGEROUS=1 のとき Codex (Linux) を YOLO モードで起動する", () => {
  const cfg = loadConfig({ AI_WEBUI_PROJECTS_ROOT_LINUX: "/tmp", AI_WEBUI_ALLOW_DANGEROUS: "1" });
  const spec = buildSessionSpec(cfg, {
    target: "Linux",
    tool: "codex",
    projectPath: "/tmp/sample",
    completionCriteria: "テスト",
  });
  assert.ok(spec.command.includes("--allow-dangerous"));
  assert.equal(cfg.allowDangerous, true);
});

test("buildSessionSpec は Claude (Linux) に --allow-dangerous を付けない", () => {
  const cfg = loadConfig({ AI_WEBUI_PROJECTS_ROOT_LINUX: "/tmp" });
  const spec = buildSessionSpec(cfg, {
    target: "Linux",
    tool: "claude",
    projectPath: "/tmp/sample",
    completionCriteria: "テスト",
  });
  assert.ok(!spec.command.includes("--allow-dangerous"));
});

test("buildSessionSpec は Codex (Windows) を既定では YOLO モードにしない", () => {
  const cfg = loadConfig({
    AI_WEBUI_WINDOWS_HOST: "win-host",
    AI_WEBUI_WINDOWS_USER: "user",
    AI_WEBUI_WINDOWS_PROJECTS_ROOT: "D:\\projects",
    AI_WEBUI_WINDOWS_TOOLKIT_ROOT: "D:\\AI-Coding-Startup-Tools",
  });
  const spec = buildSessionSpec(cfg, {
    target: "Windows",
    tool: "codex",
    projectPath: "D:\\projects\\sample",
    completionCriteria: "テスト",
  });
  const command = spec.command.join(" ");
  assert.match(command, /Start-Codex\.ps1/);
  assert.ok(!command.includes("-Yolo"));
  assert.ok(!command.includes("-AllowDangerous"));
  assert.match(command, /-Set 'PROJECT_NAME=sample','COMPLETION_CRITERIA=テスト'/);
  assert.equal((command.match(/-Set /g) || []).length, 1);
});

test("buildSessionSpec は AI_WEBUI_ALLOW_DANGEROUS=1 のとき Codex (Windows) を YOLO モードで起動する", () => {
  const cfg = loadConfig({
    AI_WEBUI_WINDOWS_HOST: "win-host",
    AI_WEBUI_WINDOWS_USER: "user",
    AI_WEBUI_WINDOWS_PROJECTS_ROOT: "D:\\projects",
    AI_WEBUI_WINDOWS_TOOLKIT_ROOT: "D:\\AI-Coding-Startup-Tools",
    AI_WEBUI_ALLOW_DANGEROUS: "1",
  });
  const spec = buildSessionSpec(cfg, {
    target: "Windows",
    tool: "codex",
    projectPath: "D:\\projects\\sample",
    completionCriteria: "テスト",
  });
  const command = spec.command.join(" ");
  assert.match(command, /-Yolo/);
  assert.ok(!command.includes("-AllowDangerous"));
  assert.match(command, /-Set 'PROJECT_NAME=sample','COMPLETION_CRITERIA=テスト'/);
  assert.equal((command.match(/-Set /g) || []).length, 1);
});

test("buildSessionSpec は Claude (Windows) に -AllowDangerous を付けない", () => {
  const cfg = loadConfig({
    AI_WEBUI_WINDOWS_HOST: "win-host",
    AI_WEBUI_WINDOWS_USER: "user",
    AI_WEBUI_WINDOWS_PROJECTS_ROOT: "D:\\projects",
    AI_WEBUI_WINDOWS_TOOLKIT_ROOT: "D:\\AI-Coding-Startup-Tools",
  });
  const spec = buildSessionSpec(cfg, {
    target: "Windows",
    tool: "claude",
    projectPath: "D:\\projects\\sample",
    completionCriteria: "テスト",
  });
  const command = spec.command.join(" ");
  assert.ok(!command.includes("-AllowDangerous"));
  assert.match(command, /-PermissionMode auto/);
  assert.match(command, /-Set 'PROJECT_NAME=sample','COMPLETION_CRITERIA=テスト'/);
  assert.equal((command.match(/-Set /g) || []).length, 1);
});

test("POST /api/session はルート外パスを拒否する (403)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "Linux", projectPath: os.tmpdir(), tool: "claude" }),
  });
  assert.equal(res.status, 403);
  server.close();
});

test("POST /api/session は Windows ホスト未設定時に 409 を返す", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "Windows", projectPath: "C:\\projects\\sample", tool: "claude" }),
  });
  assert.equal(res.status, 409);
  server.close();
});

test("POST /api/session は有効な Linux セッションを作成する", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: "Linux",
      projectPath: path.join(root, "sample"),
      tool: "claude",
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.match(data.sessionId, /^[0-9a-f]{64}$/);
  assert.match(data.wsPath, /^\/api\/session\?id=/);
  server.close();
});

test("POST /api/session は同時セッション数の上限を適用する (429)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const body = JSON.stringify({
    target: "Linux",
    projectPath: path.join(root, "sample"),
    tool: "claude",
  });
  const headers = { "Content-Type": "application/json" };
  const first = await fetch(`${base}/api/session`, { method: "POST", headers, body });
  const second = await fetch(`${base}/api/session`, { method: "POST", headers, body });
  const third = await fetch(`${base}/api/session`, { method: "POST", headers, body });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  server.close();
});

test("WebSocket /api/session は不明なセッション ID を拒否する (404)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const result = await openWs(base, "/api/session?id=nonexistent");
  assert.equal(result.response.statusCode, 404);
  server.close();
});

test("WebSocket /api/session は不正な Host ヘッダーを拒否する (403, DNS リバインディング対策)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const result = await openWs(base, "/api/session?id=nonexistent", { Host: "evil.example" });
  assert.equal(result.response.statusCode, 403);
  server.close();
});

test("WebSocket /api/session は Host と異なる Origin を拒否する (403, CSWSH 対策)", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const result = await openWs(base, "/api/session?id=nonexistent", {
    Origin: "http://evil.example",
  });
  assert.equal(result.response.statusCode, 403);
  server.close();
});

test("WebSocket /api/session はトークン認証後に PTY を開始する", async () => {
  const root = makeProjectsRoot();
  const projectPath = path.join(root, "sample");
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_TOKEN: "test-token",
    NODE_ENV: "test",
    AI_WEBUI_TEST_SESSION_CMD: JSON.stringify(["/bin/sh", "-c", "printf 'pty-ok'; exit 0"]),
  });
  try {
    const created = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": "test-token" },
      body: JSON.stringify({ target: "Linux", projectPath, tool: "claude" }),
    });
    assert.equal(created.status, 200);
    const { sessionId } = await created.json();

    const { socket, head } = await openWs(base, `/api/session?id=${sessionId}`);
    const read = createWsReader(socket, head);
    const auth = await read();
    assert.equal(auth.type, "text");
    assert.equal(JSON.parse(auth.data.toString()).type, "auth-required");

    socket.write(clientTextFrame(JSON.stringify({ type: "auth", token: "test-token" })));

    const output = await read();
    assert.equal(output.type, "binary");
    assert.match(output.data.toString(), /pty-ok/);

    const exit = await read();
    assert.equal(exit.type, "text");
    assert.equal(JSON.parse(exit.data.toString()).type, "exit");
    socket.destroy();
  } finally {
    server.close();
  }
});

test("WebSocket /api/session は誤ったトークンを拒否する (1008)", async () => {
  const root = makeProjectsRoot();
  const projectPath = path.join(root, "sample");
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    AI_WEBUI_TOKEN: "test-token",
    NODE_ENV: "test",
    AI_WEBUI_TEST_SESSION_CMD: JSON.stringify(["/bin/sh", "-c", "echo should-not-run"]),
  });
  try {
    const created = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": "test-token" },
      body: JSON.stringify({ target: "Linux", projectPath, tool: "claude" }),
    });
    const { sessionId } = await created.json();

    const { socket, head } = await openWs(base, `/api/session?id=${sessionId}`);
    const read = createWsReader(socket, head);
    const auth = await read();
    assert.equal(JSON.parse(auth.data.toString()).type, "auth-required");

    socket.write(clientTextFrame(JSON.stringify({ type: "auth", token: "wrong-token" })));
    const close = await read();
    assert.equal(close.type, "close");
    assert.equal(parseClosePayload(close.data).code, 1008);
    socket.destroy();
  } finally {
    server.close();
  }
});

test("WebSocket /api/session はトークン未設定時は認証なしで PTY を開始する", async () => {
  const root = makeProjectsRoot();
  const projectPath = path.join(root, "sample");
  const { server, base } = await startApp({
    AI_WEBUI_PROJECTS_ROOT_LINUX: root,
    NODE_ENV: "test",
    AI_WEBUI_TEST_SESSION_CMD: JSON.stringify(["/bin/sh", "-c", "printf 'no-auth-ok'; exit 0"]),
  });
  try {
    const created = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "Linux", projectPath, tool: "codex" }),
    });
    assert.equal(created.status, 200);
    const { sessionId } = await created.json();

    const { socket, head } = await openWs(base, `/api/session?id=${sessionId}`);
    const read = createWsReader(socket, head);
    const output = await read();
    assert.equal(output.type, "binary");
    assert.match(output.data.toString(), /no-auth-ok/);
    socket.destroy();
  } finally {
    server.close();
  }
});
