// AI Coding Startup Tools WebUI サーバー
// 実装: Node.js 標準モジュールのみ (依存パッケージ追加なし)
// 既定で localhost にバインドする。LAN 公開時は AI_WEBUI_HOST=0.0.0.0 とトークンを設定する。

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isInsideRoot,
  isInsideWindowsRoot,
  listProjects,
} from "./lib/projects.mjs";
import { runSsh } from "./lib/ssh.mjs";

const TOOLKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

export function loadConfig(env = process.env) {
  return {
    host: env.AI_WEBUI_HOST || "127.0.0.1",
    port: Number(env.AI_WEBUI_PORT || 8080),
    token: env.AI_WEBUI_TOKEN || "",
    projectsRootLinux: path.resolve(
      env.AI_WEBUI_PROJECTS_ROOT_LINUX || path.join(os.homedir(), "projects"),
    ),
    windowsHost: env.AI_WEBUI_WINDOWS_HOST || "",
    windowsUser: env.AI_WEBUI_WINDOWS_USER || "",
    windowsProjectsRoot: env.AI_WEBUI_WINDOWS_PROJECTS_ROOT || "C:\\projects",
    windowsToolkitRoot: env.AI_WEBUI_WINDOWS_TOOLKIT_ROOT || "D:\\AI-Coding-Startup-Tools",
    toolkitRoot: TOOLKIT_ROOT,
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function authorized(cfg, req) {
  if (!cfg.token) {
    return true;
  }
  return req.headers["x-auth-token"] === cfg.token;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsProjectsCommand(cfg) {
  return (
    "powershell -NoProfile -NonInteractive -Command " +
    `"Get-ChildItem -LiteralPath ${psQuote(cfg.windowsProjectsRoot)} -Directory | ` +
    `Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -and ` +
    `(Test-Path -LiteralPath (Join-Path $_.FullName '.ai-startup-tools')) } | ` +
    `ForEach-Object { $_.FullName }"`
  );
}

function windowsActionCommand(cfg, action, tool, projectPath) {
  const root = cfg.windowsToolkitRoot.replace(/[\\/]+$/, "");
  const scripts = {
    "install-check-claude": ["claude-code", "Install-Check.ps1"],
    "install-check-codex": ["codex", "Install-Check.ps1"],
    "launch-check-claude": ["claude-code", "Start-ClaudeCode.ps1"],
    "launch-check-codex": ["codex", "Start-Codex.ps1"],
  };
  const entry = scripts[action];
  if (!entry) {
    return null;
  }
  const scriptPath = `${root}\\${entry[0]}\\windows\\${entry[1]}`;
  const base = `powershell -NoProfile -NonInteractive -Command "& ${psQuote(scriptPath)}`;
  if (action.startsWith("launch-check-")) {
    return `${base} -Check -ProjectDirectory ${psQuote(projectPath)}"`;
  }
  return `${base}"`;
}

function handleLinuxAction(cfg, body) {
  const action = body.action;
  if (!["diagnose", "bootstrap"].includes(action)) {
    return { status: 400, body: { ok: false, error: "不明なアクションです" } };
  }
  const projectPath = path.resolve(String(body.projectPath || ""));
  if (!isInsideRoot(cfg.projectsRootLinux, projectPath)) {
    return { status: 403, body: { ok: false, error: "プロジェクトパスがルート外です" } };
  }

  const script =
    action === "diagnose"
      ? path.join(cfg.toolkitRoot, "scripts/linux/diagnose.sh")
      : path.join(cfg.toolkitRoot, "scripts/linux/bootstrap.sh");
  const args =
    action === "diagnose"
      ? ["--project-dir", projectPath]
      : ["--project-dir", projectPath, body.apply ? "--apply" : "--dry-run", "--non-interactive"];
  if (action === "bootstrap" && body.apply) {
    args.push("--yes");
  }

  const res = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    timeout: 60000,
    cwd: cfg.toolkitRoot,
  });
  return {
    status: 200,
    body: {
      ok: res.status === 0,
      exitCode: res.status,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
    },
  };
}

function handleWindowsAction(cfg, body) {
  if (!cfg.windowsHost) {
    return { status: 200, body: { ok: false, error: "Windows ホストが未設定です" } };
  }
  const action = body.action;
  const allowed = [
    "install-check-claude",
    "install-check-codex",
    "launch-check-claude",
    "launch-check-codex",
  ];
  if (!allowed.includes(action)) {
    return { status: 400, body: { ok: false, error: "不明なアクションです" } };
  }
  let projectPath = "";
  if (action.startsWith("launch-check-")) {
    projectPath = String(body.projectPath || "");
    if (!isInsideWindowsRoot(cfg.windowsProjectsRoot, projectPath)) {
      return { status: 403, body: { ok: false, error: "プロジェクトパスが Windows ルート外です" } };
    }
  }
  const command = windowsActionCommand(cfg, action, body.tool, projectPath);
  if (!command) {
    return { status: 400, body: { ok: false, error: "コマンドを組み立てられません" } };
  }
  const res = runSsh(cfg.windowsHost, cfg.windowsUser, command, { timeout: 60000 });
  return {
    status: 200,
    body: {
      ok: res.ok,
      exitCode: res.status,
      stdout: res.stdout,
      stderr: res.stderr,
    },
  };
}

export function createApp(cfg) {
  const config = cfg || loadConfig();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        toolkitVersion: "0.1.0",
        os: `${process.platform} (${process.arch})`,
        config: {
          projectsRootLinux: config.projectsRootLinux,
          windowsHost: config.windowsHost || null,
          windowsProjectsRoot: config.windowsProjectsRoot,
        },
      });
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, error: "Not Found" });
      return;
    }

    if (!authorized(config, req)) {
      sendJson(res, 401, { ok: false, error: "トークンが必要です (x-auth-token ヘッダー)" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/linux/projects") {
      sendJson(res, 200, { ok: true, projects: listProjects(config.projectsRootLinux) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/windows/projects") {
      if (!config.windowsHost) {
        sendJson(res, 200, { ok: true, projects: [], error: "Windows ホストが未設定です" });
        return;
      }
      const result = runSsh(
        config.windowsHost,
        config.windowsUser,
        windowsProjectsCommand(config),
        { timeout: 30000 },
      );
      const projects = result.ok
        ? result.stdout.split(/\r?\n/).filter(Boolean).map((p) => ({
            name: p.split(/[\\/]/).filter(Boolean).pop(),
            path: p,
          }))
        : [];
      sendJson(res, 200, { ok: result.ok, projects, error: result.ok ? undefined : result.stderr });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/linux/action") {
      try {
        const body = await readBody(req);
        const result = handleLinuxAction(config, body);
        sendJson(res, result.status, result.body);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/windows/action") {
      try {
        const body = await readBody(req);
        const result = handleWindowsAction(config, body);
        sendJson(res, result.status, result.body);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not Found" });
  });
}

function main() {
  const config = loadConfig();
  const server = createApp(config);
  server.listen(config.port, config.host, () => {
    console.log(`AI Coding Startup Tools WebUI: http://${config.host}:${config.port}`);
    console.log(`Linux プロジェクトルート: ${config.projectsRootLinux}`);
    if (config.windowsHost) {
      console.log(`Windows (SSH): ${config.windowsUser ? `${config.windowsUser}@` : ""}${config.windowsHost}`);
    } else {
      console.log("Windows (SSH): 未設定 (AI_WEBUI_WINDOWS_HOST を設定してください)");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
