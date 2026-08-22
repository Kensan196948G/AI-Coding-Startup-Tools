// DeepSeek Coding Tools WebUI サーバー
// 実装: Node.js 標準モジュールのみ (依存パッケージ追加なし)
// 既定で localhost にバインドする。LAN 公開時は DEEPSEEK_WEBUI_HOST=0.0.0.0 とトークンを設定する。

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redact } from "../scripts/validation/lib/redact.mjs";
import { performUpgrade } from "./lib/websocket.mjs";
import {
  basenameOfPath,
  listProjectsForRoots,
  resolveInsideRoot,
} from "./lib/projects.mjs";

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

/**
 * 複数ルートのいずれか配下かをシンボリックリンク解決後に判定し、
 * 配下なら canonicalize 済みパスを返す。ルート外は null。
 * @param {string[]} roots
 * @param {string} candidate
 * @returns {string|null}
 */
function resolveInsideAnyRoot(roots, candidate) {
  for (const root of roots) {
    const resolved = resolveInsideRoot(root, candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

// カンマ区切りで複数ルートを受け付ける (例: "/path/a,/path/b")。
function parseRootList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const localRoots = parseRootList(env.DEEPSEEK_LOCAL_ROOTS || env.AI_WEBUI_PROJECTS_ROOT_LINUX);
  const smbRoots = parseRootList(env.DEEPSEEK_SMB_ROOTS);
  const host = env.DEEPSEEK_WEBUI_HOST || env.AI_WEBUI_HOST || "127.0.0.1";
  const token = env.DEEPSEEK_WEBUI_TOKEN || env.AI_WEBUI_TOKEN || "";
  const port = Number(env.DEEPSEEK_WEBUI_PORT || env.AI_WEBUI_PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("DEEPSEEK_WEBUI_PORT は 0〜65535 の整数で指定してください (0 はランダムポート)");
  }
  const hostKey = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"]);
  if (!loopbackHosts.has(hostKey) && !token) {
    throw new Error(
      "DEEPSEEK_WEBUI_HOST でループバック以外を指定する場合は DEEPSEEK_WEBUI_TOKEN が必須です (fail-closed)",
    );
  }
  const rateLimitPerMinute = Number(env.DEEPSEEK_WEBUI_RATE_LIMIT || env.AI_WEBUI_RATE_LIMIT_PER_MINUTE || 120);
  if (!Number.isInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 10000) {
    throw new Error("AI_WEBUI_RATE_LIMIT_PER_MINUTE は 1〜10000 の整数で指定してください");
  }
  const projectsRootsLocal = (localRoots.length ? localRoots : ["/srv/deepseek-workspaces"]).map((p) => path.resolve(p));
  const projectsRootsSmb = (smbRoots.length ? smbRoots : ["/mnt/deepseek-smb"]).map((p) => path.resolve(p));
  return {
    host,
    port,
    token,
    rateLimitPerMinute,
    trustProxy: env.DEEPSEEK_WEBUI_TRUST_PROXY === "1" || env.AI_WEBUI_TRUST_PROXY === "1",
    logDir: path.resolve(env.DEEPSEEK_AUDIT_LOG_DIR || env.AI_WEBUI_LOG_DIR || path.join(TOOLKIT_ROOT, ".deepseek-coding-tools/logs")),
    projectsRootsLocal,
    projectsRootsSmb,
    projectsRootsLinux: [...projectsRootsLocal, ...projectsRootsSmb],
    toolkitRoot: TOOLKIT_ROOT,
    // テスト専用: NODE_ENV=test のときだけセッション起動コマンドを差し替えられる
    testSessionCmd:
      env.NODE_ENV === "test" ? String(env.DEEPSEEK_WEBUI_TEST_SESSION_CMD || env.AI_WEBUI_TEST_SESSION_CMD || "") : "",
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
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
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
  let currentDate = "";
  let lastRotationCheck = 0;
  const KEEP_GENERATIONS = 7;
  const ROTATION_CHECK_INTERVAL_MS = 60_000;

  try {
    fs.mkdirSync(logDir, { recursive: true });
    file = path.join(logDir, "webui-audit.jsonl");
  } catch {
    // 監査ログを初期化できない場合は記録しない (サーバー起動は継続する)
  }

  function rotateIfNeeded() {
    if (!file) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (today === currentDate) return;
    currentDate = today;

    try {
      if (!fs.existsSync(file)) return;
      const stat = fs.statSync(file);
      if (stat.size === 0) return; // 空ファイルはローテーション不要

      // 既存ファイルを日付付きでリネーム
      const rotated = `${file}.${currentDate}`;
      fs.renameSync(file, rotated);

      // 古い世代を削除
      const dir = path.dirname(file);
      const base = path.basename(file);
      const archives = fs.readdirSync(dir)
        .filter((f) => f.startsWith(`${base}.`) && /^\d{4}-\d{2}-\d{2}$/.test(f.slice(base.length + 1)))
        .sort();
      while (archives.length > KEEP_GENERATIONS) {
        const oldest = archives.shift();
        try {
          fs.unlinkSync(path.join(dir, oldest));
        } catch {
          // 削除失敗は無視
        }
      }

      // ローテーション後のファイルを非同期 gzip 圧縮
      const gz = zlib.createGzip();
      const inp = fs.createReadStream(rotated);
      const out = fs.createWriteStream(`${rotated}.gz`);
      inp.pipe(gz).pipe(out);
      out.on("finish", () => {
        try {
          fs.unlinkSync(rotated);
        } catch {
          // 削除失敗は無視
        }
      });
      out.on("error", () => {
        // 圧縮失敗時は未圧縮のまま保持
      });
      inp.on("error", () => {
        try {
          fs.unlinkSync(`${rotated}.gz`);
        } catch {
          // 削除失敗は無視
        }
      });
      gz.on("error", () => {
        try {
          fs.unlinkSync(`${rotated}.gz`);
        } catch {
          // 削除失敗は無視
        }
      });
    } catch {
      // ローテーション失敗は無視（監査ログ記録を妨げない）
    }
  }

  return function audit(entry) {
    if (!file) return;
    const now = Date.now();
    if (now - lastRotationCheck >= ROTATION_CHECK_INTERVAL_MS) {
      lastRotationCheck = now;
      rotateIfNeeded();
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
          cwd: session.projectPath,
          env: { TERM: "xterm-256color", COLORTERM: "truecolor" },
        };
      }
    } catch {
      // 不正なテストコマンドは無視して通常パスへ
    }
  }

  const command = [
    "/bin/bash",
    path.join(cfg.toolkitRoot, "scripts/linux/launch.sh"),
    "--workspace",
    session.projectPath,
    "--profile",
    session.profile,
  ];
  return {
    command,
    cwd: session.projectPath,
    env: {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      DEEPSEEK_SESSION_MODE: session.profile,
      DEEPSEEK_COMPLETION_CRITERIA: session.completionCriteria,
    },
  };
}

function handleLinuxAction(cfg, body) {
  const action = body.action;
  if (!["diagnose", "bootstrap"].includes(action)) {
    return { status: 400, body: { ok: false, error: "不明なアクションです" } };
  }
  const projectPath = resolveInsideAnyRoot(cfg.projectsRootsLinux, path.resolve(String(body.projectPath || "")));
  if (!projectPath) {
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

function handleLinuxTemplate(cfg, body) {
  const template = body.template;
  if (!TEMPLATE_CATEGORIES.includes(template)) {
    return { status: 400, body: { ok: false, error: "不明なテンプレートです" } };
  }
  const projectPath = resolveInsideAnyRoot(cfg.projectsRootsLinux, path.resolve(String(body.projectPath || "")));
  if (!projectPath) {
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

  function gitWorkspace(projectPath) {
    const candidate = String(projectPath || "");
    if (!candidate) throw new Error("projectPath が必要です");
    const resolved = resolveInsideAnyRoot(config.projectsRootsLinux, path.resolve(candidate));
    if (!resolved) {
      const error = new Error("Workspaceが許可Root外です");
      error.status = 403;
      throw error;
    }
    const top = spawnSync("git", ["-C", resolved, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024,
    });
    if (top.status !== 0 || path.resolve(top.stdout.trim()) !== resolved) {
      throw new Error("選択したWorkspaceはGit repository rootではありません");
    }
    return resolved;
  }

  function runGit(workspace, args, timeout = 15000) {
    const result = spawnSync("git", ["-C", workspace, ...args], {
      encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      ok: result.status === 0,
      exitCode: result.status,
      stdout: redact(String(result.stdout || "")).slice(0, 200000),
      stderr: redact(String(result.stderr || "")).slice(0, 200000),
    };
  }

  function currentBranch(workspace) {
    const result = runGit(workspace, ["branch", "--show-current"]);
    if (!result.ok || !result.stdout.trim()) throw new Error("現在branchを取得できません");
    return result.stdout.trim();
  }

  function ensureWorkBranch(workspace) {
    const branch = currentBranch(workspace);
    if (["main", "master"].includes(branch.toLowerCase())) {
      const error = new Error("保護branchではcommit / push / PRを実行できません");
      error.status = 409;
      throw error;
    }
    return branch;
  }

  function gitStatus(projectPath) {
    const workspace = gitWorkspace(projectPath);
    const branchResult = runGit(workspace, ["branch", "--show-current"]);
    const statusResult = runGit(workspace, ["status", "--short", "--branch"]);
    const diffResult = runGit(workspace, ["diff", "--stat", "--"]);
    if (!branchResult.ok || !statusResult.ok || !diffResult.ok) {
      throw new Error(statusResult.stderr || branchResult.stderr || diffResult.stderr || "Git statusに失敗しました");
    }
    return {
      workspace,
      branch: branchResult.stdout.trim() || "(detached)",
      status: statusResult.stdout,
      diffStat: diffResult.stdout,
    };
  }

  function handleGitAction(body, requestId) {
    const workspace = gitWorkspace(body.projectPath);
    const action = String(body.action || "");
    let result;
    if (action === "diff") {
      result = runGit(workspace, ["diff", "--", "."]);
    } else if (action === "commit") {
      ensureWorkBranch(workspace);
      const message = String(body.message || "").trim();
      if (!/^(feat|fix|docs|test|refactor|chore|ci|build|perf)(\([a-z0-9._-]+\))?!?: .{1,120}$/i.test(message)) {
        throw new Error("commit messageはConventional Commits形式で指定してください");
      }
      result = runGit(workspace, ["commit", "-m", message], 30000);
    } else if (action === "push") {
      const branch = ensureWorkBranch(workspace);
      result = runGit(workspace, ["push", "--set-upstream", "origin", branch], 60000);
    } else if (action === "pr") {
      const branch = ensureWorkBranch(workspace);
      const command = spawnSync("gh", ["pr", "create", "--fill", "--head", branch], {
        cwd: workspace, encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      });
      result = {
        ok: command.status === 0, exitCode: command.status,
        stdout: redact(String(command.stdout || "")).slice(0, 200000),
        stderr: redact(String(command.stderr || "")).slice(0, 200000),
      };
    } else {
      throw new Error("actionはdiff / commit / push / prのいずれかです");
    }
    audit({ requestId, action: `git.${action}`, workspace, ok: result.ok, exitCode: result.exitCode });
    return result;
  }

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
    const target = body.target || "Linux";
    const tool = body.tool || "opencode";
    const profile = String(body.profile || "safe");
    if (target !== "Linux") {
      return { status: 400, body: { ok: false, error: "DeepSeek Coding Session は Linux のみ対応します" } };
    }
    if (tool !== "opencode") {
      return { status: 400, body: { ok: false, error: "tool は opencode のみ指定できます" } };
    }
    if (!["safe", "development", "autonomous", "deep-debug"].includes(profile)) {
      return { status: 400, body: { ok: false, error: "不明なSandbox profileです" } };
    }
    const projectPath = String(body.projectPath || "");
    if (!projectPath) {
      return { status: 400, body: { ok: false, error: "projectPath が必要です" } };
    }
    const resolved = resolveInsideAnyRoot(cfg.projectsRootsLinux, path.resolve(projectPath));
    if (!resolved) {
      return { status: 403, body: { ok: false, error: "Workspaceが許可Root外です" } };
    }
    try {
      if (!fs.statSync(resolved).isDirectory()) {
        return { status: 400, body: { ok: false, error: "Workspaceが存在しません" } };
      }
    } catch {
      return { status: 400, body: { ok: false, error: "Workspaceが存在しません" } };
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
      profile,
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

  function isLoopbackHostname(hostname) {
    const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "::ffff:127.0.0.1";
  }

  /**
   * WebSocket アップグレードの Host / Origin 検証 (DNS リバインディング・CSWSH 対策)。
   * @returns {{ok: boolean, reason?: string}}
   */
  function checkUpgradeOrigin(cfg, req) {
    const hostHeader = String(req.headers.host || "").toLowerCase();
    const hostname = hostHeader.split(":")[0] || "";
    const configured = String(cfg.host || "127.0.0.1").toLowerCase().replace(/^\[|\]$/g, "");
    const wildcardHost = configured === "0.0.0.0" || configured === "::";
    if (!wildcardHost && !isLoopbackHostname(hostname) && hostname !== configured) {
      return { ok: false, reason: "Host ヘッダーが許可されたホストではありません" };
    }
    const origin = req.headers.origin;
    if (origin === undefined) {
      // 非ブラウザクライアントはループバック接続のみ許可する
      return isLoopbackHostname(hostname)
        ? { ok: true }
        : { ok: false, reason: "Origin ヘッダーがありません" };
    }
    let originHostname;
    try {
      originHostname = new URL(String(origin)).hostname.toLowerCase();
    } catch {
      return { ok: false, reason: "Origin ヘッダーが不正です" };
    }
    if (!isLoopbackHostname(originHostname) && originHostname !== hostname) {
      return { ok: false, reason: "Origin が Host と一致しません" };
    }
    return { ok: true };
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
    const originCheck = checkUpgradeOrigin(cfg, req);
    if (!originCheck.ok) {
      audit({
        requestId: crypto.randomBytes(6).toString("hex"),
        level: "warn",
        action: "session.connect",
        sessionId: url.searchParams.get("id") || "",
        ip: clientIp(cfg, req),
        error: originCheck.reason,
      });
      rejectUpgrade(socket, 403, "Forbidden");
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
      if (req.method === "GET" && (url.pathname === "/app.js" || url.pathname === "/index.html")) {
        const filePath = path.join(PUBLIC_DIR, url.pathname === "/index.html" ? "index.html" : "app.js");
        const contentType = url.pathname === "/index.html"
          ? "text/html; charset=utf-8"
          : "text/javascript; charset=utf-8";
        try {
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            "Content-Type": contentType,
            "Content-Length": stat.size,
            "Cache-Control": "public, max-age=300",
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        } catch {
          sendJson(res, 404, { ok: false, error: "Not Found" });
          return;
        }
      }

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
        const checks = { pty: PYTHON_OK };
        // python3 詳細健全性チェック
        if (PYTHON_OK) {
          try {
            const pyCheck = spawnSync("python3", ["-c", "import pty, fcntl, termios, selectors, struct; print('ok')"], {
              encoding: "utf8", timeout: 3000,
            });
            checks.ptyDetail = pyCheck.status === 0 ? "ok" : "degraded";
          } catch {
            checks.ptyDetail = "error";
          }
        }
        // ログディレクトリ書込みチェック
        try {
          const testFile = path.join(config.logDir, ".healthcheck");
          fs.writeFileSync(testFile, String(Date.now()), "utf8");
          fs.unlinkSync(testFile);
          checks.logWritable = true;
        } catch {
          checks.logWritable = false;
        }
        // ディスク容量チェック (ルートファイルシステムの空き容量)
        try {
          const stat = fs.statfsSync?.(config.toolkitRoot);
          if (stat) {
            const freeMB = Math.floor((stat.bsize * stat.bfree) / (1024 * 1024));
            checks.diskFreeMB = freeMB;
            checks.diskLow = freeMB < 100;
          }
        } catch {
          // statfsSync 未対応環境ではスキップ
        }
        sendJson(res, checks.diskLow ? 503 : 200, {
          ok: !checks.diskLow,
          toolkitVersion: TOOLKIT_VERSION,
          checks,
        });
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
            localRoots: config.projectsRootsLocal,
            smbRoots: config.projectsRootsSmb,
            enabledProvider: "deepseek",
          },
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/linux/projects") {
        sendJson(res, 200, {
          ok: true,
          storage: {
            local: listProjectsForRoots(config.projectsRootsLocal),
            smb: listProjectsForRoots(config.projectsRootsSmb),
          },
          roots: listProjectsForRoots(config.projectsRootsLinux),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/git/status") {
        try {
          sendJson(res, 200, { ok: true, ...gitStatus(url.searchParams.get("projectPath")) });
        } catch (error) {
          sendJson(res, error.status || 400, { ok: false, error: redact(error.message) });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/git/action") {
        try {
          const body = await readBody(req);
          const result = handleGitAction(body, requestId);
          sendJson(res, result.ok ? 200 : 409, result);
        } catch (error) {
          sendJson(res, error.status || 400, { ok: false, error: redact(error.message) });
        }
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
    try {
      handleUpgrade(config, req, socket, head);
    } catch (error) {
      audit({
        requestId: crypto.randomBytes(6).toString("hex"),
        level: "error",
        action: "upgrade.error",
        error: redact(error.message || String(error)),
      });
      rejectUpgrade(socket, 500, "Internal Server Error");
    }
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
    console.log(`DeepSeek Coding Tools WebUI: http://${config.host}:${config.port}`);
    console.log(`Workspace roots: ${config.projectsRootsLinux.join(", ")}`);
    if (!PYTHON_OK) {
      console.warn("[WARN] python3 が見つかりません。対話セッション (/api/session) は利用できません。");
    }
    console.log(`Local roots: ${config.projectsRootsLocal.join(", ")}`);
    console.log(`SMB roots: ${config.projectsRootsSmb.join(", ")}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
