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
  assert.equal(data.config.projectsRootLinux, root);
  server.close();
});

test("GET /api/linux/projects が判定基準Cで列挙する", async () => {
  const root = makeProjectsRoot();
  const { server, base } = await startApp({ AI_WEBUI_PROJECTS_ROOT_LINUX: root });
  const res = await fetch(`${base}/api/linux/projects`);
  const data = await res.json();
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].name, "sample");
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
