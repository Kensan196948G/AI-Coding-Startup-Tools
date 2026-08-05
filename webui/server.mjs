// AI Coding Startup Tools WebUI サーバー
// 実装: Node.js 標準モジュールのみ (依存パッケージ追加なし)
// 既定で localhost にバインドする。LAN 公開時は AI_WEBUI_HOST=0.0.0.0 とトークンを設定する。

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redact } from "../scripts/validation/lib/redact.mjs";
import { performUpgrade } from "./lib/websocket.mjs";
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
const WEBUI_DIR = path.dirname(fileURLToPath(import.meta.url));
const RELAY_SCRIPT = path.join(WEBUI_DIR, "lib", "pty_relay.py");
const TEMPLATE_CATEGORIES = ["requirements", "design", "review", "release"];
const TOOLKIT_VERSION = JSON.parse(fs.readFileSync(path.join(TOOLKIT_ROOT, "package.json"), "utf8")).version;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_IP = 2;
const MAX_SESSIONS_TOTAL = 16;
const DEFAULT_COMPLETION_CRITERIA =
  "WebUI から起動された対話セッション。完了条件は利用者の指示に従う。";

function pythonAvailable() {
  const res = spawnSync(
    "python3",
    ["-c", "import pty, fcntl, termios, selectors, struct; print('ok')"],
    { encoding: "utf8", timeout: 5000 },
  );
  return res.status === 0;
}

const PYTHON_OK = pythonAvailable();

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
    // テスト専用: NODE_ENV=test のときだけセッション起動コマンドを差し替えられる
    testSessionCmd:
      env.NODE_ENV === "test" ? String(env.AI_WEBUI_TEST_SESSION_CMD || "") : "",
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

function tokenMatches(expected, provided) {
  if (typeof provided !== "string" || provided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
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

function cleanCompletionCriteria(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
    return null;
  }
  return text || DEFAULT_COMPLETION_CRITERIA;
}

export function buildSessionSpec(cfg, session) {
  // テスト専用のコマンド差し替え (NODE_ENV=test のときのみ有効)
  if (cfg.testSessionCmd) {
    try {
      const command = JSON.parse(cfg.testSessionCmd);
      if (Array.isArray(command) && command.length && command.every((x) => typeof x === "string")) {
        return {
          command,
          cwd: session.target === "Linux" ? cfg.toolkitRoot : null,
          env: { TERM: "xterm-256color", COLORTERM: "truecolor" },
        };
      }
    } catch {
      // 不正なテストコマンドは無視して通常パスへ
    }
  }

  const name = basenameOfPath(session.projectPath) || "project";
  if (session.target === "Linux") {
    const rel = session.tool === "claude"
      ? "claude-code/linux/launch.sh"
      : "codex/linux/launch.sh";
    const command = [
      "/bin/bash",
      path.join(cfg.toolkitRoot, rel),
      "--project-dir",
      session.projectPath,
      "--set",
      `PROJECT_NAME=${name}`,
      "--set",
      `COMPLETION_CRITERIA=${session.completionCriteria}`,
      "--yes",
    ];
    // Codex は YOLO モード (全権限) で起動する
    if (session.tool === "codex") {
      command.push("--allow-dangerous");
    }
    return {
      command,
      // コンソール実行と同じくツールキットルートで起動する (プロンプト相対パス解決のため)
      cwd: cfg.toolkitRoot,
      env: { TERM: "xterm-256color", COLORTERM: "truecolor" },
    };
  }

  // Windows: SSH + PTY (-tt) 経由で PowerShell の起動スクリプトを実行する
  const root = cfg.windowsToolkitRoot.replace(/[\\/]+$/, "");
  const rel = session.tool === "claude"
    ? "claude-code\\windows\\Start-ClaudeCode.ps1"
    : "codex\\windows\\Start-Codex.ps1";
  const scriptPath = `${root}\\${rel}`;
  const psCommand =
    "powershell -NoProfile -Command " +
    `"& ${psQuote(scriptPath)} -ProjectDirectory ${psQuote(session.projectPath)} ` +
    `-Set ${psQuote(`PROJECT_NAME=${name}`)},${psQuote(`COMPLETION_CRITERIA=${session.completionCriteria}`)} ` +
    `-Yes${session.tool === "codex" ? " -AllowDangerous" : ""}"`;
  const user = cfg.windowsUser ? `${cfg.windowsUser}@` : "";
  return {
    command: ["ssh", "-tt", `${user}${cfg.windowsHost}`, psCommand],
    cwd: null,
    env: { TERM: "xterm-256color", COLORTERM: "truecolor" },
  };
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
  const sessions = new Map();

  function countActive(ip, onlyConnected = false) {
    let perIp = 0;
    let total = 0;
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.createdAt >= SESSION_TTL_MS) {
        sessions.delete(sessionId);
        continue;
      }
      if (!onlyConnected || session.ws) {
        total += 1;
        if (ip !== undefined && session.ip === ip) {
          perIp += 1;
        }
      }
    }
    return { perIp, total };
  }

  function handleSessionCreate(cfg, body, ip, requestId) {
    const target = body.target;
    const tool = body.tool;
    if (target !== "Linux" && target !== "Windows") {
      return { status: 400, body: { ok: false, error: "target は Linux または Windows です" } };
    }
    if (tool !== "claude" && tool !== "codex") {
      return { status: 400, body: { ok: false, error: "tool は claude または codex です" } };
    }
    const projectPath = String(body.projectPath || "");
    if (!projectPath) {
      return { status: 400, body: { ok: false, error: "projectPath が必要です" } };
    }
    if (target === "Linux") {
      const resolved = path.resolve(projectPath);
      if (!isInsideAnyRoot(cfg.projectsRootsLinux, resolved)) {
        return { status: 403, body: { ok: false, error: "プロジェクトパスがルート外です" } };
      }
      try {
        if (!fs.statSync(resolved).isDirectory()) {
          return { status: 400, body: { ok: false, error: "プロジェクトフォルダが存在しません" } };
        }
      } catch {
        return { status: 400, body: { ok: false, error: "プロジェクトフォルダが存在しません" } };
      }
    } else {
      if (!cfg.windowsHost) {
        return { status: 409, body: { ok: false, error: "Windows ホストが未設定です" } };
      }
      if (!isInsideAnyWindowsRoot(cfg.windowsProjectsRoots, projectPath)) {
        return { status: 403, body: { ok: false, error: "プロジェクトパスが Windows ルート外です" } };
      }
      if (!isSafeWindowsPath(projectPath)) {
        return { status: 400, body: { ok: false, error: "プロジェクトパスに使用できない文字が含まれています" } };
      }
    }

    const completionCriteria = cleanCompletionCriteria(body.completionCriteria);
    if (completionCriteria === null) {
      return { status: 400, body: { ok: false, error: "completionCriteria に使用できない文字が含まれています" } };
    }
    const active = countActive(ip, false);
    if (active.perIp >= MAX_SESSIONS_PER_IP) {
      return { status: 429, body: { ok: false, error: "同時セッション数の上限に達しました" } };
    }
    if (active.total >= MAX_SESSIONS_TOTAL) {
      return { status: 503, body: { ok: false, error: "セッション数の上限に達しました" } };
    }

    const session = {
      id: crypto.randomBytes(32).toString("hex"),
      target,
      tool,
      projectPath,
      completionCriteria,
      ip,
      createdAt: Date.now(),
      ws: null,
    };
    sessions.set(session.id, session);
    audit({ requestId, action: "session.create", sessionId: session.id, target, tool, projectPath, ip });
    return {
      status: 200,
      body: { ok: true, sessionId: session.id, wsPath: `/api/session?id=${session.id}` },
    };
  }

  function rejectUpgrade(socket, status, message) {
    if (!socket.destroyed && socket.writable) {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    }
    socket.destroy();
  }

  function handleUpgrade(cfg, req, socket, head) {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    if (url.pathname !== "/api/session") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const requestId = crypto.randomBytes(6).toString("hex");
    const id = url.searchParams.get("id") || "";
    const session = sessions.get(id);
    const ip = clientIp(cfg, req);
    if (!session) {
      audit({ requestId, level: "warn", action: "session.connect", sessionId: id, ip, error: "unknown session" });
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (session.ws) {
      audit({ requestId, level: "warn", action: "session.connect", sessionId: id, ip, error: "already connected" });
      rejectUpgrade(socket, 409, "Session already connected");
      return;
    }
    if (Date.now() - session.createdAt >= SESSION_TTL_MS) {
      sessions.delete(id);
      rejectUpgrade(socket, 410, "Session expired");
      return;
    }
    if (!rateLimit(ip)) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    const active = countActive(ip, true);
    if (active.perIp >= MAX_SESSIONS_PER_IP || active.total >= MAX_SESSIONS_TOTAL) {
      audit({ requestId, level: "warn", action: "session.connect", sessionId: id, ip, error: "session limit" });
      rejectUpgrade(socket, 503, "Session limit reached");
      return;
    }

    const startedAt = Date.now();
    let relay = null;
    let relayExitSent = false;
    let relayExitCode = null;
    let authTimer = null;
    let authed = !cfg.token;
    let authExpired = false;
    let cleaned = false;

    function cleanup(exitCode) {
      if (cleaned) return;
      cleaned = true;
      session.ws = null;
      sessions.delete(id);
      if (authTimer) clearTimeout(authTimer);
      if (relay) {
        try {
          relay.stdin.write(JSON.stringify({ type: "kill" }) + "\n");
          relay.stdin.end();
        } catch {
          // リレーは既に終了している
        }
        const killer = setTimeout(() => {
          try {
            relay.kill("SIGKILL");
          } catch {
            // 無視
          }
        }, 2000);
        killer.unref?.();
        relay = null;
      }
      audit({
        requestId,
        action: "session.stop",
        sessionId: id,
        target: session.target,
        tool: session.tool,
        projectPath: session.projectPath,
        ip,
        durationMs: Date.now() - startedAt,
        exitCode: exitCode ?? relayExitCode,
      });
    }

    function startRelay() {
      if (!PYTHON_OK) {
        ws.sendText(JSON.stringify({ type: "error", message: "python3 が利用できません" }));
        ws.close(1011, "python3 required");
        return;
      }
      const spec = {
        ...buildSessionSpec(cfg, session),
        cols: 80,
        rows: 24,
      };
      relay = spawn("python3", [RELAY_SCRIPT, JSON.stringify(spec)], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      relay.stdout.on("data", (chunk) => ws.sendBinary(chunk));

      let stderrBuffer = "";
      relay.stderr.on("data", (chunk) => {
        stderrBuffer += chunk.toString("utf8");
        let newline;
        while ((newline = stderrBuffer.indexOf("\n")) >= 0) {
          const line = stderrBuffer.slice(0, newline);
          stderrBuffer = stderrBuffer.slice(newline + 1);
          let status;
          try {
            status = JSON.parse(line);
          } catch {
            continue;
          }
          if (status.type === "exit") {
            relayExitSent = true;
            relayExitCode = typeof status.code === "number" ? status.code : null;
            if (!ws.closed) {
              ws.sendText(JSON.stringify({ type: "exit", code: relayExitCode }));
              ws.close(1000, "exited");
            }
          } else if (status.type === "error") {
            relayExitSent = true;
            if (!ws.closed) {
              ws.sendText(JSON.stringify({ type: "error", message: String(status.message || "PTY リレーエラー") }));
              ws.close(1011, "relay error");
            }
          }
        }
      });

      relay.on("error", (error) => {
        relayExitSent = true;
        if (!ws.closed) {
          ws.sendText(JSON.stringify({ type: "error", message: redact(error.message || "PTY リレーを起動できません") }));
          ws.close(1011, "relay error");
        }
      });
      relay.on("exit", (code) => {
        if (!relayExitSent) {
          relayExitSent = true;
          relayExitCode = code;
          if (!ws.closed) {
            ws.sendText(JSON.stringify({ type: "exit", code }));
            ws.close(1000, "exited");
          }
        }
        cleanup(code);
      });
    }

    function handleWsText(text) {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        ws.close(1003, "invalid JSON");
        return;
      }
      if (authExpired) {
        ws.close(1008, "認証タイムアウト");
        return;
      }
      if (!authed) {
        if (message.type !== "auth" || typeof message.token !== "string" || !tokenMatches(cfg.token, message.token)) {
          ws.close(1008, "認証に失敗しました");
          return;
        }
        authed = true;
        if (authTimer) clearTimeout(authTimer);
        startRelay();
        return;
      }
      if (message.type === "input") {
        if (typeof message.data !== "string" || !relay || relayExitSent) return;
        if (message.data.length > 350000) {
          ws.close(1009, "input too large");
          return;
        }
        const decoded = Buffer.from(message.data, "base64");
        if (!decoded.length || decoded.length > 262144) {
          if (decoded.length > 262144) ws.close(1009, "input too large");
          return;
        }
        try {
          relay.stdin.write(JSON.stringify({ type: "input", data: decoded.toString("base64") }) + "\n");
        } catch {
          // リレー終了直後
        }
        return;
      }
      if (message.type === "resize") {
        const cols = Number(message.cols);
        const rows = Number(message.rows);
        if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 1 || rows > 500) {
          ws.close(1003, "invalid resize");
          return;
        }
        if (relay && !relayExitSent) {
          try {
            relay.stdin.write(JSON.stringify({ type: "resize", cols, rows }) + "\n");
          } catch {
            // リレー終了直後
          }
        }
        return;
      }
      if (message.type === "kill") {
        if (relay && !relayExitSent) {
          try {
            relay.stdin.write(JSON.stringify({ type: "kill" }) + "\n");
          } catch {
            // リレー終了直後
          }
        }
        ws.close(1000, "killed");
      }
    }

    const ws = performUpgrade(req, socket, head, {
      onText: handleWsText,
      onBinary: () => ws.close(1003, "binary messages are not accepted"),
      onClose: () => cleanup(),
      onError: (error) => {
        // クライアント切断 (ECONNRESET/EPIPE) は正常系として監査しない
        if (error && (error.code === "ECONNRESET" || error.code === "EPIPE")) {
          return;
        }
        audit({
          requestId,
          level: "error",
          action: "session.error",
          sessionId: id,
          ip,
          error: redact(error.message || String(error)),
        });
      },
      onBackpressure: (paused) => {
        if (relay && relay.stdout) {
          if (paused) {
            relay.stdout.pause();
          } else {
            relay.stdout.resume();
          }
        }
      },
    });
    if (!ws) return;
    session.ws = ws;

    if (cfg.token) {
      ws.sendText(JSON.stringify({ type: "auth-required" }));
      authTimer = setTimeout(() => {
        if (!authed) {
          authExpired = true;
          ws.close(1008, "認証タイムアウト");
        }
      }, 10000);
    } else {
      startRelay();
    }
  }

  const server = http.createServer(async (req, res) => {
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
        const host = req.headers.host || "localhost";
        const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
        const csp = SECURITY_HEADERS["Content-Security-Policy"].replace(
          "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
          `connect-src 'self' ws://${host} wss://${host} https://fonts.googleapis.com https://fonts.gstatic.com`,
        );
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          "Content-Security-Policy": csp,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      // 同梱アセット (xterm.js など) の配信
      if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
        const vendorRoot = path.join(PUBLIC_DIR, "vendor");
        const rel = url.pathname.slice("/vendor/".length);
        const filePath = path.resolve(vendorRoot, rel);
        if (!filePath.startsWith(`${vendorRoot}${path.sep}`)) {
          sendJson(res, 404, { ok: false, error: "Not Found" });
          return;
        }
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) {
            sendJson(res, 404, { ok: false, error: "Not Found" });
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          const contentType =
            ext === ".js"
              ? "text/javascript; charset=utf-8"
              : ext === ".css"
                ? "text/css; charset=utf-8"
                : ext === ".json"
                  ? "application/json; charset=utf-8"
                  : "application/octet-stream";
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            "Content-Type": contentType,
            "Content-Length": stat.size,
            "Cache-Control": "public, max-age=3600",
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        } catch {
          sendJson(res, 404, { ok: false, error: "Not Found" });
          return;
        }
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
          session: {
            pty: PYTHON_OK,
          },
          config: {
            toolkitRoot: config.toolkitRoot,
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

      if (req.method === "POST" && url.pathname === "/api/session") {
        try {
          const body = await readBody(req);
          const result = handleSessionCreate(config, body, clientIp(config, req), requestId);
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

  server.on("upgrade", (req, socket, head) => {
    handleUpgrade(config, req, socket, head);
  });

  return server;
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
    if (!PYTHON_OK) {
      console.warn("[WARN] python3 が見つかりません。対話セッション (/api/session) は利用できません。");
    }
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
