// AI Coding Startup Tools WebUI サーバー
// 実装: Node.js 標準モジュールのみ (依存パッケージ追加なし)
// 既定で localhost にバインドする。LAN 公開時は AI_WEBUI_HOST=0.0.0.0 とトークンを設定する。

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redact } from "../scripts/validation/lib/redact.mjs";
import {
  basenameOfPath,
  isInsideAnyRoot,
  isInsideAnyWindowsRoot,
  isSafeWindowsPath,
  listProjectsForRoots,
} from "./lib/projects.mjs";
import { runSsh } from "./lib/ssh.mjs";

const TOOLKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TEMPLATE_CATEGORIES = ["requirements", "design", "review", "release"];
const TOOLKIT_VERSION = JSON.parse(fs.readFileSync(path.join(TOOLKIT_ROOT, "package.json"), "utf8")).version;

// カンマ区切りで複数ルートを受け付ける (例: "/path/a,/path/b")。
function parseRootList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const linuxRoots = parseRootList(env.AI_WEBUI_PROJECTS_ROOT_LINUX);
  const windowsRoots = parseRootList(env.AI_WEBUI_WINDOWS_PROJECTS_ROOT);
  const port = Number(env.AI_WEBUI_PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("AI_WEBUI_PORT は 0〜65535 の整数で指定してください (0 はランダムポート)");
  }
  const rateLimitPerMinute = Number(env.AI_WEBUI_RATE_LIMIT_PER_MINUTE || 120);
  if (!Number.isInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 10000) {
    throw new Error("AI_WEBUI_RATE_LIMIT_PER_MINUTE は 1〜10000 の整数で指定してください");
  }
  return {
    host: env.AI_WEBUI_HOST || "127.0.0.1",
    port,
    token: env.AI_WEBUI_TOKEN || "",
    rateLimitPerMinute,
    trustProxy: env.AI_WEBUI_TRUST_PROXY === "1",
    logDir: env.AI_WEBUI_LOG_DIR
      ? path.resolve(env.AI_WEBUI_LOG_DIR)
      : path.join(TOOLKIT_ROOT, ".ai-startup-tools/logs"),
    projectsRootsLinux: (linuxRoots.length ? linuxRoots : [path.join(os.homedir(), "projects")]).map(
      (p) => path.resolve(p),
    ),
    windowsHost: env.AI_WEBUI_WINDOWS_HOST || "",
    windowsUser: env.AI_WEBUI_WINDOWS_USER || "",
    windowsProjectsRoots: windowsRoots.length ? windowsRoots : ["C:\\projects"],
    windowsToolkitRoot: env.AI_WEBUI_WINDOWS_TOOLKIT_ROOT || "D:\\AI-Coding-Startup-Tools",
    toolkitRoot: TOOLKIT_ROOT,
  };
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Cache-Control": "no-store",
};

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
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
  const provided = req.headers["x-auth-token"];
  if (typeof provided !== "string" || provided.length !== cfg.token.length) {
    return false;
  }
  const expected = Buffer.from(cfg.token);
  const actual = Buffer.from(provided);
  return crypto.timingSafeEqual(expected, actual);
}

function createRateLimiter(limitPerMinute) {
  const buckets = new Map();
  const WINDOW_MS = 60_000;
  return function rateLimit(ip) {
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    // メモリ増加を防ぐため、定期的に期限切れバケットを掃除する
    if (buckets.size > 10000) {
      for (const [key, value] of buckets) {
        if (now - value.windowStart >= WINDOW_MS) {
          buckets.delete(key);
        }
      }
    }
    return bucket.count <= limitPerMinute;
  };
}

function createAuditLogger(logDir) {
  let file = null;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    file = path.join(logDir, "webui-audit.jsonl");
  } catch {
    // 監査ログを初期化できない場合は記録しない (サーバー起動は継続する)
  }
  return function audit(entry) {
    if (!file) {
      return;
    }
    try {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        component: "webui",
        ...entry,
      });
      fs.appendFileSync(file, `${line}\n`, "utf8");
    } catch {
      // 監査ログの失敗でリクエスト処理を妨げない
    }
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsProjectsCommand(root) {
  return (
    "powershell -NoProfile -NonInteractive -Command " +
    `"Get-ChildItem -LiteralPath ${psQuote(root)} -Directory | ` +
    `Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '.git') } | ` +
    `ForEach-Object { $_.FullName + [char]9 + (Test-Path -LiteralPath (Join-Path $_.FullName '.ai-startup-tools')) }"`
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
  if (!isInsideAnyRoot(cfg.projectsRootsLinux, projectPath)) {
    return { status: 403, body: { ok: false, error: "プロジェクトパスがルート外です" } };
  }

  const script =
    action === "diagnose"
      ? path.join(cfg.toolkitRoot, "scripts/linux/diagnose.sh")
      : path.join(cfg.toolkitRoot, "scripts/linux/bootstrap.sh");
  const args =
    action === "diagnose"
      ? []
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
    if (!isInsideAnyWindowsRoot(cfg.windowsProjectsRoots, projectPath)) {
      return { status: 403, body: { ok: false, error: "プロジェクトパスが Windows ルート外です" } };
    }
    if (!isSafeWindowsPath(projectPath)) {
      return { status: 400, body: { ok: false, error: "プロジェクトパスに使用できない文字が含まれています" } };
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

function handleLinuxTemplate(cfg, body) {
  const template = body.template;
  if (!TEMPLATE_CATEGORIES.includes(template)) {
    return { status: 400, body: { ok: false, error: "不明なテンプレートです" } };
  }
  const projectPath = path.resolve(String(body.projectPath || ""));
  if (!isInsideAnyRoot(cfg.projectsRootsLinux, projectPath)) {
    return { status: 403, body: { ok: false, error: "プロジェクトパスがルート外です" } };
  }

  const vars = body.vars && typeof body.vars === "object" ? body.vars : {};
  const name = String(vars.PROJECT_NAME || "");
  const slug = String(vars.PROJECT_SLUG || "");
  if (!name || !slug) {
    return { status: 400, body: { ok: false, error: "PROJECT_NAME と PROJECT_SLUG が必要です" } };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return { status: 400, body: { ok: false, error: "PROJECT_SLUG は小文字英数字とハイフンのみです" } };
  }

  const script = path.join(cfg.toolkitRoot, "scripts/linux/render-template.sh");
  const args = [
    "--template", path.join(cfg.toolkitRoot, "templates", template),
    "--project-dir", projectPath,
    "--set", `PROJECT_NAME=${name}`,
    "--set", `PROJECT_SLUG=${slug}`,
    body.apply ? "--apply" : "--dry-run",
  ];
  if (body.apply) {
    args.push("--yes");
  }

  const res = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    timeout: 30000,
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

export function createApp(cfg) {
  const config = cfg || loadConfig();
  const rateLimit = createRateLimiter(config.rateLimitPerMinute);
  const audit = createAuditLogger(config.logDir);
  return http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = crypto.randomBytes(6).toString("hex");
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      audit({
        requestId,
        method: req.method,
        path: urlForAudit(req.url),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: clientIp(config, req),
      });
    });

    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (req.method === "GET" && url.pathname === "/") {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      // 監視・死活監視用の最小エンドポイント (認証なし・設定情報を含まない)
      if (req.method === "GET" && url.pathname === "/api/healthz") {
        sendJson(res, 200, { ok: true, toolkitVersion: TOOLKIT_VERSION });
        return;
      }

      if (!url.pathname.startsWith("/api/")) {
        sendJson(res, 404, { ok: false, error: "Not Found" });
        return;
      }

      if (!rateLimit(clientIp(config, req))) {
        sendJson(res, 429, { ok: false, error: "リクエストが多すぎます。しばらく待ってから再試行してください。" });
        return;
      }

      if (!authorized(config, req)) {
        sendJson(res, 401, { ok: false, error: "トークンが必要です (x-auth-token ヘッダー)" });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          toolkitVersion: TOOLKIT_VERSION,
          os: `${process.platform} (${process.arch})`,
          config: {
            projectsRootsLinux: config.projectsRootsLinux,
            windowsHost: config.windowsHost || null,
            windowsUser: config.windowsUser || null,
            windowsProjectsRoots: config.windowsProjectsRoots,
            windowsToolkitRoot: config.windowsHost ? config.windowsToolkitRoot : null,
          },
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/linux/projects") {
        sendJson(res, 200, { ok: true, roots: listProjectsForRoots(config.projectsRootsLinux) });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/windows/projects") {
        if (!config.windowsHost) {
          sendJson(res, 200, { ok: true, roots: [], error: "Windows ホストが未設定です" });
          return;
        }
        const roots = config.windowsProjectsRoots.map((root) => {
          const result = runSsh(
            config.windowsHost,
            config.windowsUser,
            windowsProjectsCommand(root),
            { timeout: 30000 },
          );
        const projects = result.ok
          ? result.stdout.split(/\r?\n/).filter(Boolean).map((p) => ({
              name: basenameOfPath(p.split("\t")[0]),
              path: p.split("\t")[0],
              bootstrapped: p.split("\t")[1] === "True",
            }))
          : [];
          return {
            root,
            label: basenameOfPath(root),
            projects,
            error: result.ok ? undefined : result.stderr,
          };
        });
        const ok = roots.every((r) => !r.error);
        sendJson(res, 200, { ok, roots });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/linux/action") {
        try {
          const body = await readBody(req);
          const result = handleLinuxAction(config, body);
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: redact(error.message) });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/linux/template") {
        try {
          const body = await readBody(req);
          const result = handleLinuxTemplate(config, body);
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: redact(error.message) });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/windows/action") {
        try {
          const body = await readBody(req);
          const result = handleWindowsAction(config, body);
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: redact(error.message) });
        }
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not Found" });
    } catch (error) {
      audit({
        requestId,
        level: "error",
        method: req.method,
        path: urlForAudit(req.url),
        error: redact(error.message || String(error)),
      });
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: "サーバー内部でエラーが発生しました" });
      } else {
        res.end();
      }
    }
  });
}

function clientIp(cfg, req) {
  if (cfg.trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.includes(",")) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress || "unknown";
}

function urlForAudit(value) {
  return redact(String(value || "").slice(0, 500));
}

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(2);
  }
  const server = createApp(config);
  server.listen(config.port, config.host, () => {
    console.log(`AI Coding Startup Tools WebUI: http://${config.host}:${config.port}`);
    console.log(`Linux プロジェクトルート: ${config.projectsRootsLinux.join(", ")}`);
    if (config.windowsHost) {
      console.log(`Windows (SSH): ${config.windowsUser ? `${config.windowsUser}@` : ""}${config.windowsHost}`);
      console.log(`Windows プロジェクトルート: ${config.windowsProjectsRoots.join(", ")}`);
    } else {
      console.log("Windows (SSH): 未設定 (AI_WEBUI_WINDOWS_HOST を設定してください)");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
