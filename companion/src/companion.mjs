import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "1.0.6";
const DEFAULT_PORT = 47831;
const SESSION_TTL_MS = 60_000;
const WORKSPACE_TTL_MS = 30 * 60_000;
const MAX_WORKSPACES = 32;
const BROWSER_PAIR_TTL_MS = 8 * 60 * 60_000;
const MAX_BROWSER_PAIRS = 16;
const PROFILES = new Set(["safe", "development", "autonomous", "deep-debug"]);
const DEFAULT_ORIGINS = new Set([
  "https://ai-coding.mirai-dx-platform.com",
]);
const CLI_FILE = path.resolve(process.argv[1] || "deepseek-coding-companion");
const IS_PACKAGED = Boolean(process.pkg);
const OMO_CONFIG = {
  auto_update: false,
  model_fallback: false,
  runtime_fallback: false,
  disabled_providers: ["anthropic", "openai", "google", "gemini", "github-copilot", "xai", "zai", "moonshot", "kimi", "minimax", "openrouter"],
  agents: {
    sisyphus: { model: "deepseek/deepseek-v4-pro" }, hephaestus: { model: "deepseek/deepseek-v4-pro" },
    prometheus: { model: "deepseek/deepseek-v4-pro" }, oracle: { model: "deepseek/deepseek-v4-pro" },
    metis: { model: "deepseek/deepseek-v4-pro" }, momus: { model: "deepseek/deepseek-v4-pro" },
    atlas: { model: "deepseek/deepseek-v4-pro" }, "multimodal-looker": { model: "deepseek/deepseek-v4-pro" },
    "sisyphus-junior": { model: "deepseek/deepseek-v4-flash" }, explore: { model: "deepseek/deepseek-v4-flash" },
    librarian: { model: "deepseek/deepseek-v4-flash" },
  },
};

export function openCodeConfig(profile) {
  const sensitive = { ".env": "deny", ".env.*": "deny", "*.env": "deny", "*.env.*": "deny", "*.pem": "deny", "*.key": "deny", "id_rsa*": "deny", "id_ed25519*": "deny", "credentials*": "deny", "secrets*": "deny" };
  const common = {
    "$schema": "https://opencode.ai/config.json",
    plugin: ["oh-my-opencode@4.19.4"], enabled_providers: ["deepseek"],
    model: "deepseek/deepseek-v4-pro", small_model: "deepseek/deepseek-v4-flash",
  };
  if (profile === "safe") return { ...common, permission: { read: { "*": "allow", ...sensitive }, edit: "ask", bash: "ask", task: "allow", skill: "ask", external_directory: "deny" } };
  const bash = {
    "*": "ask",
    "sudo*": "deny", "su *": "deny", "mount*": "deny", "umount*": "deny", "systemctl*": "deny", "shutdown*": "deny",
    "reboot*": "deny", "mkfs*": "deny", "fdisk*": "deny", "iptables*": "deny", "nft*": "deny", "useradd*": "deny", "passwd*": "deny",
    "rm -rf /": "deny", "rm -rf /*": "deny",
  };
  const permission = { read: { "*": "allow", ...sensitive }, edit: "allow", bash, task: "allow", skill: profile === "autonomous" ? "allow" : "ask", external_directory: "deny" };
  if (profile === "deep-debug") permission.doom_loop = "ask";
  return { ...common, permission };
}

function json(res, status, value, origin = "") {
  const body = JSON.stringify(value);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function tokenMatches(expected, provided) {
  if (typeof provided !== "string" || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function validHostHeader(req, port) {
  const host = String(req.headers.host || "").toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

function allowedOrigin(req, origins) {
  const origin = String(req.headers.origin || "");
  return !origin || origins.has(origin) ? origin : null;
}

function validSmbTarget(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/i.test(value);
}

function validSmbPart(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 120 && /^[^\\/:*?"<>|\x00-\x1f]+$/.test(value);
}

function validSmbUser(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 160 && !/[/@:|\x00-\x1f]/.test(value);
}

function validSmbPassword(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 512 && !/[\x00\r\n]/.test(value);
}

export function isPathAtOrInside(candidate, boundary, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const fold = (value) => platform === "win32" ? value.toLowerCase() : value;
  const relative = pathApi.relative(fold(pathApi.resolve(boundary)), fold(pathApi.resolve(candidate)));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
}

function fileIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    birthtimeMs: Number.isFinite(stat.birthtimeMs) ? Math.trunc(stat.birthtimeMs) : 0,
  };
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}

function inspectSafeWorkspace(candidate) {
  const canonical = fs.realpathSync(candidate);
  const root = path.parse(canonical).root;
  const exactDenied = new Set([root, os.homedir()]);
  const subtreeDenied = new Set();
  if (process.platform === "win32") {
    exactDenied.add(path.join(root, "Users"));
    for (const name of ["Windows", "Program Files", "Program Files (x86)", "ProgramData"]) subtreeDenied.add(path.join(root, name));
  } else {
    for (const name of ["/Users", "/Volumes"]) exactDenied.add(name);
    for (const name of ["/Applications", "/Library", "/System"]) subtreeDenied.add(name);
  }
  const folded = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const blocked = [...exactDenied].some((item) => (process.platform === "win32" ? item.toLowerCase() : item) === folded)
    || [...subtreeDenied].some((item) => isPathAtOrInside(canonical, item));
  if (blocked) throw new Error("ディスクRoot、ユーザーHome全体またはOS領域はWorkspaceに選択できません");
  const stat = fs.statSync(canonical);
  if (!stat.isDirectory()) throw new Error("選択対象はフォルダではありません");
  return { path: canonical, identity: fileIdentity(stat) };
}

function assertSafeStateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Companion state directory must be a real directory");
  try { fs.chmodSync(directory, 0o700); } catch (error) { if (process.platform !== "win32") throw error; }
}

function assertSafeStateFile(file) {
  if (!fs.existsSync(file)) return;
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Companion state file must be a regular file");
  try { fs.chmodSync(file, 0o600); } catch (error) { if (process.platform !== "win32") throw error; }
}

function inspectOpenCodeNative(platform = process.platform) {
  const lookup = spawnSync(platform === "win32" ? "where.exe" : "which", ["opencode"], { encoding: "utf8", timeout: 5000 });
  const first = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).map((v) => v.trim()).find(Boolean) : "";
  if (!first) return { version: "", binary: "" };
  const binary = fs.realpathSync(first);
  const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000, shell: false });
  return { version: version.status === 0 ? version.stdout.trim() : "", binary };
}

function pickFolderNative(platform = process.platform) {
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$d.Description = 'DeepSeek Coding Tools: Workspaceを選択'",
      "$d.ShowNewFolderButton = $false",
      "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Write-Output $d.SelectedPath }",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      encoding: "utf8", windowsHide: true, timeout: 5 * 60_000,
    });
    if (result.status !== 0) throw new Error("Windowsフォルダ選択を開始できませんでした");
    return result.stdout.trim();
  }
  if (platform === "darwin") {
    const result = spawnSync("osascript", ["-e", "POSIX path of (choose folder with prompt \"DeepSeek Coding Tools: Workspaceを選択\")"], {
      encoding: "utf8", timeout: 5 * 60_000,
    });
    if (result.status !== 0) return "";
    return result.stdout.trim().replace(/\/$/, "");
  }
  throw new Error("CompanionはWindows 11またはmacOSで利用してください");
}

function openSmbNative({ host, share, user, password }, platform = process.platform) {
  if (!validSmbTarget(host) || !validSmbPart(share) || !validSmbUser(user) || !validSmbPassword(password)) {
    throw new Error("SMB接続先、共有名／共有フォルダ名、ユーザー名またはパスワードの形式が正しくありません");
  }
  if (platform === "win32") {
    const remotePath = `\\\\${host}\\${share}`;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$p = [Console]::In.ReadToEnd() | ConvertFrom-Json",
      "New-SmbMapping -RemotePath $p.remotePath -UserName $p.user -Password $p.password -Persistent $false | Out-Null",
    ].join("; ");
    const mapping = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      input: JSON.stringify({ remotePath, user, password }), encoding: "utf8", windowsHide: true, timeout: 30_000,
    });
    if (mapping.status !== 0) throw new Error("SMB接続に失敗しました。接続先、ユーザー名、パスワードとWindows資格情報を確認してください");
    const child = spawn("explorer.exe", [`\\\\${host}\\${share}`], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { uri: `\\\\${host}\\${share}`, credentialUi: "Windows", connected: true };
  }
  if (platform === "darwin") {
    const uri = `smb://${host}/${encodeURIComponent(share)}`;
    const script = `mount volume "${appleScriptString(uri)}" as user name "${appleScriptString(user)}" with password "${appleScriptString(password)}"`;
    const mapping = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", timeout: 30_000 });
    if (mapping.status !== 0) throw new Error("SMB接続に失敗しました。接続先、ユーザー名、パスワードとキーチェーン情報を確認してください");
    const child = spawn("open", [uri], { detached: true, stdio: "ignore" });
    child.unref();
    return { uri: `smb://${host}/${share}`, credentialUi: "macOS", connected: true };
  }
  throw new Error("SMB接続はWindows 11またはmacOSで利用してください");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function appleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function launchAttachTerminal(sessionId, port, platform = process.platform) {
  const node = process.execPath;
  const command = IS_PACKAGED
    ? `${shellQuote(node)} attach ${shellQuote(sessionId)} ${port}`
    : `${shellQuote(node)} ${shellQuote(CLI_FILE)} attach ${shellQuote(sessionId)} ${port}`;
  if (platform === "win32") {
    const attachCommand = IS_PACKAGED
      ? `"${node}" attach "${sessionId}" ${port}`
      : `"${node}" "${CLI_FILE}" attach "${sessionId}" ${port}`;
    const child = spawn("cmd.exe", ["/d", "/k", attachCommand], {
      detached: true, stdio: "ignore", windowsHide: false,
    });
    child.unref();
    return;
  }
  if (platform === "darwin") {
    const script = `tell application "Terminal" to do script "${appleScriptString(command)}"`;
    const child = spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  throw new Error("ローカル起動はWindows 11またはmacOSで利用してください");
}

function ensureState(config) {
  assertSafeStateDirectory(config.stateDir);
  assertSafeStateFile(config.tokenFile);
  if (!fs.existsSync(config.tokenFile)) {
    fs.writeFileSync(config.tokenFile, crypto.randomBytes(32).toString("base64url") + "\n", { mode: 0o600, flag: "wx" });
  }
  const token = fs.readFileSync(config.tokenFile, "utf8").trim();
  if (token.length < 24) throw new Error("Companion pairing token is invalid");
  assertSafeStateDirectory(config.runtimeConfigDir);
  const omoConfigFile = path.join(config.runtimeConfigDir, "oh-my-opencode.json");
  assertSafeStateFile(omoConfigFile);
  fs.writeFileSync(omoConfigFile, JSON.stringify(OMO_CONFIG, null, 2) + "\n", { mode: 0o600 });
  return token;
}

export function loadCompanionConfig(env = process.env) {
  const port = Number(env.DEEPSEEK_COMPANION_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Companion port must be 1024-65535");
  const stateDir = path.resolve(env.DEEPSEEK_COMPANION_STATE_DIR || path.join(os.homedir(), ".deepseek-coding-companion"));
  const origins = new Set(DEFAULT_ORIGINS);
  for (const item of String(env.DEEPSEEK_COMPANION_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean)) origins.add(item);
  return { host: "127.0.0.1", port, stateDir, tokenFile: path.join(stateDir, "pairing-token"), runtimeConfigDir: path.join(stateDir, "runtime-config"), origins };
}

export function buildOpenCodeLaunch(claim, config, baseEnv = process.env) {
  if (!path.isAbsolute(claim.binary || "")) throw new Error("OpenCode binary must be absolute");
  const canonicalBinary = fs.realpathSync(claim.binary);
  const binaryIdentity = fileIdentity(fs.statSync(canonicalBinary));
  if (canonicalBinary !== claim.binary || !sameFileIdentity(binaryIdentity, claim.binaryIdentity)) {
    throw new Error("OpenCode binary changed after verification");
  }
  const workspace = inspectSafeWorkspace(claim.workspace);
  if (workspace.path !== claim.workspace || !sameFileIdentity(workspace.identity, claim.workspaceIdentity)) {
    throw new Error("Workspace changed after verification");
  }
  const childEnv = { ...baseEnv };
  for (const key of Object.keys(childEnv)) {
    if (/^(OPENAI|ANTHROPIC|GOOGLE|GEMINI|AZURE|GITHUB|GH|NPM|XAI|OPENROUTER|MOONSHOT|MISTRAL|COHERE|AWS)(_|$)/i.test(key)
      || /^(HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key)
      || /^(OMO|OCX)_PROFILE$/i.test(key)
      || key === "DEEPSEEK_API_KEY") delete childEnv[key];
  }
  childEnv.DEEPSEEK_API_KEY = claim.deepseekApiKey;
  childEnv.DEEPSEEK_SESSION_MODE = claim.profile;
  childEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify(openCodeConfig(claim.profile));
  childEnv.OPENCODE_CONFIG_DIR = config.runtimeConfigDir;
  return {
    binary: canonicalBinary,
    args: claim.profile === "safe" ? [] : ["--auto"],
    options: { cwd: workspace.path, env: childEnv, stdio: "inherit", shell: false },
  };
}

export function createCompanionServer(config, dependencies = {}) {
  const token = dependencies.token || ensureState(config);
  const pickFolder = dependencies.pickFolder || (() => pickFolderNative());
  const openSmb = dependencies.openSmb || ((body) => openSmbNative(body));
  const launchTerminal = dependencies.launchTerminal || ((id) => launchAttachTerminal(id, config.port));
  const inspectOpenCode = dependencies.inspectOpenCode || (() => inspectOpenCodeNative());
  const now = dependencies.now || (() => Date.now());
  const workspaces = new Map();
  const sessions = new Map();
  const browserPairs = new Map();

  function authenticated(req) {
    const provided = req.headers["x-companion-token"];
    if (tokenMatches(token, provided)) return true;
    if (typeof provided !== "string") return false;
    const pair = browserPairs.get(provided);
    if (!pair) return false;
    if (pair.expiresAt <= now()) {
      browserPairs.delete(provided);
      return false;
    }
    return pair.origin === String(req.headers.origin || "");
  }

  const server = http.createServer(async (req, res) => {
    const origin = allowedOrigin(req, config.origins);
    if (!validHostHeader(req, config.port)) return json(res, 421, { ok: false, error: "Invalid Host" });
    if (origin === null) return json(res, 403, { ok: false, error: "Origin is not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin || "https://ai-coding.mirai-dx-platform.com",
        "Access-Control-Allow-Headers": "content-type,x-companion-token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      return res.end();
    }
    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
    if (req.method === "GET" && url.pathname === "/v1/health") {
      return json(res, 200, { ok: true, version: VERSION, platform: process.platform, paired: false }, origin);
    }
    if (req.method === "POST" && url.pathname === "/v1/pair") {
      if (!origin) return json(res, 403, { ok: false, error: "Browser Originが必要です" });
      const timestamp = now();
      for (const [pairToken, pair] of browserPairs) {
        if (pair.expiresAt <= timestamp) browserPairs.delete(pairToken);
      }
      while (browserPairs.size >= MAX_BROWSER_PAIRS) browserPairs.delete(browserPairs.keys().next().value);
      const sessionToken = crypto.randomBytes(32).toString("base64url");
      browserPairs.set(sessionToken, { origin, expiresAt: timestamp + BROWSER_PAIR_TTL_MS });
      return json(res, 201, {
        ok: true, paired: true, sessionToken,
        expiresInSeconds: Math.trunc(BROWSER_PAIR_TTL_MS / 1000),
      }, origin);
    }
    if (!authenticated(req)) return json(res, 401, { ok: false, error: "Companion pairing tokenが必要です" }, origin);
    try {
      if (req.method === "GET" && url.pathname === "/v1/status") {
        return json(res, 200, { ok: true, version: VERSION, platform: process.platform, paired: true, workspaceCount: workspaces.size }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/workspaces/pick") {
        const body = await readBody(req);
        const kind = body.kind === "smb" ? "smb" : body.kind === "local" || body.kind === undefined ? "local" : "";
        if (!kind) return json(res, 400, { ok: false, error: "Workspace種別が不正です" }, origin);
        const selected = await pickFolder();
        if (!selected) return json(res, 409, { ok: false, error: "フォルダ選択をキャンセルしました" }, origin);
        const snapshot = inspectSafeWorkspace(selected);
        const canonical = snapshot.path;
        const selectedAt = now();
        for (const [workspaceId, value] of workspaces) {
          if (selectedAt - value.createdAt > WORKSPACE_TTL_MS) workspaces.delete(workspaceId);
        }
        while (workspaces.size >= MAX_WORKSPACES) workspaces.delete(workspaces.keys().next().value);
        const id = crypto.randomUUID();
        workspaces.set(id, { path: canonical, identity: snapshot.identity, kind, createdAt: selectedAt });
        return json(res, 200, { ok: true, workspace: { id, kind, name: path.basename(canonical), path: canonical, git: fs.existsSync(path.join(canonical, ".git")) } }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/smb/open") {
        const body = await readBody(req);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(res, 400, { ok: false, error: "SMB接続情報の形式が正しくありません" }, origin);
        const unexpected = Object.keys(body).filter((key) => !["host", "share", "user", "password"].includes(key));
        if (unexpected.length) return json(res, 400, { ok: false, error: "SMB接続情報に未対応の項目があります" }, origin);
        const connection = {
          host: String(body.host || ""), share: String(body.share || ""),
          user: String(body.user || ""), password: String(body.password || ""),
        };
        if (!validSmbTarget(connection.host) || !validSmbPart(connection.share) || !validSmbUser(connection.user) || !validSmbPassword(connection.password)) {
          connection.password = "";
          body.password = "";
          return json(res, 400, { ok: false, error: "SMB接続情報をすべて正しい形式で入力してください" }, origin);
        }
        let result;
        try {
          result = await openSmb(connection);
        } finally {
          connection.password = "";
          body.password = "";
        }
        return json(res, 200, { ok: true, ...result, next: "SMB接続済みです。共有フォルダを選択してください" }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/sessions/launch") {
        const body = await readBody(req);
        const workspace = workspaces.get(String(body.workspaceId || ""));
        if (!workspace) return json(res, 404, { ok: false, error: "Workspace選択が期限切れです。再選択してください" }, origin);
        if (now() - workspace.createdAt > WORKSPACE_TTL_MS) {
          workspaces.delete(String(body.workspaceId || ""));
          return json(res, 410, { ok: false, error: "Workspace選択が期限切れです。再選択してください" }, origin);
        }
        const current = inspectSafeWorkspace(workspace.path);
        if (current.path !== workspace.path || !sameFileIdentity(current.identity, workspace.identity)) {
          return json(res, 409, { ok: false, error: "Workspaceまたは接続ボリュームの実体が選択後に変更されました。再選択してください" }, origin);
        }
        const profile = String(body.profile || "development");
        if (!PROFILES.has(profile)) return json(res, 400, { ok: false, error: "未知のProfileです" }, origin);
        const apiKey = String(body.deepseekApiKey || "").trim();
        if (apiKey.length < 8 || apiKey.length > 512 || /[\x00-\x20\x7f]/.test(apiKey)) {
          return json(res, 400, { ok: false, error: "DeepSeek APIキーをこのタブの設定へ入力してください" }, origin);
        }
        const runtime = inspectOpenCode();
        if (runtime.version !== "1.18.21" || !path.isAbsolute(runtime.binary || "")) return json(res, 503, { ok: false, error: `OpenCode 1.18.21 が必要です（検出: ${runtime.version || "なし"}）` }, origin);
        const sessionId = crypto.randomUUID();
        const timer = setTimeout(() => sessions.delete(sessionId), SESSION_TTL_MS);
        timer.unref?.();
        const binaryIdentity = fileIdentity(fs.statSync(runtime.binary));
        sessions.set(sessionId, { workspace, profile, apiKey, binary: runtime.binary, binaryIdentity, timer });
        launchTerminal(sessionId);
        return json(res, 202, { ok: true, sessionId, workspace: { name: path.basename(workspace.path), path: workspace.path }, terminal: "native" }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/sessions/claim") {
        const body = await readBody(req);
        const id = String(body.sessionId || "");
        const session = sessions.get(id);
        if (!session) return json(res, 404, { ok: false, error: "Session is unavailable" });
        sessions.delete(id);
        clearTimeout(session.timer);
        const claim = {
          ok: true, workspace: session.workspace.path, workspaceIdentity: session.workspace.identity,
          profile: session.profile, binary: session.binary, binaryIdentity: session.binaryIdentity,
          deepseekApiKey: session.apiKey,
        };
        session.apiKey = "";
        return json(res, 200, claim);
      }
      return json(res, 404, { ok: false, error: "Not Found" }, origin);
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message }, origin);
    }
  });
  return { server, token, workspaces, sessions, browserPairs };
}

async function claimAndRun(sessionId, port) {
  const config = loadCompanionConfig({ ...process.env, DEEPSEEK_COMPANION_PORT: String(port || DEFAULT_PORT) });
  const token = fs.readFileSync(config.tokenFile, "utf8").trim();
  const response = await fetch(`http://127.0.0.1:${config.port}/v1/sessions/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-companion-token": token },
    body: JSON.stringify({ sessionId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  const launch = buildOpenCodeLaunch(body, config);
  body.deepseekApiKey = "";
  const child = spawn(launch.binary, launch.args, launch.options);
  const exitCode = await new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
  process.exitCode = exitCode;
}

function hideConsoleWindowNative(platform = process.platform) {
  if (platform !== "win32") return false;
  const script = [
    "Add-Type -Name Win32 -Namespace Console -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow(); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'",
    "$h = [Console.Win32]::GetConsoleWindow()",
    "[Console.Win32]::ShowWindow($h, 0) | Out-Null",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", timeout: 10_000,
  });
  return result.status === 0;
}

async function waitForBackgroundHealth(config, attempts = 40, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/v1/health`);
      if (response.ok) return true;
    } catch { /* まだ起動していない。次の試行へ */ }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

function spawnBackgroundSelf() {
  const node = process.execPath;
  const args = IS_PACKAGED ? ["--background"] : [CLI_FILE, "--background"];
  const child = spawn(node, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

function promptBackground(app, config) {
  console.log("");
  console.log("Enterキーを押すとこのウィンドウを閉じてバックグラウンドへ移行します（Ctrl+Cで終了）。");
  const rl = readline.createInterface({ input: process.stdin });
  rl.once("line", () => {
    rl.close();
    // Windowsは子プロセスの再spawnによるport引き継ぎが不安定（AVスキャン・pkgスナップショット
    // 展開の遅延で子が間に合わないことがある）ため、自プロセスの既存コンソールwindowを
    // Win32 APIで直接非表示にする。プロセス自体は再起動せず、そのまま同じportで待受を継続する。
    if (process.platform === "win32") {
      const hidden = hideConsoleWindowNative();
      console.log(hidden
        ? "ウィンドウを非表示にしました。処理はこのまま継続します（終了はタスクマネージャーから）。"
        : "ウィンドウの非表示に失敗しました。このウィンドウのまま利用を継続してください。");
      return;
    }
    console.log("バックグラウンドへ移行しています…");
    // server.close()のcallbackはkeep-alive中の既存接続が終わるまで発火しないため待たない。
    // listenソケット自体はclose()呼び出しで即座に解放されるので、そのまま子プロセスを起動する。
    app.server.closeAllConnections?.();
    app.server.close();
    spawnBackgroundSelf();
    waitForBackgroundHealth(config).then((ok) => {
      if (ok) {
        console.log("バックグラウンドで起動しました。このウィンドウは閉じて構いません。");
        process.exit(0);
        return;
      }
      console.log("バックグラウンド起動を確認できませんでした。このウィンドウで起動を継続します。");
      app.server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.log("バックグラウンドで起動していました。このウィンドウは閉じて構いません。");
          process.exit(0);
          return;
        }
        console.error(`Companion error: ${error.message}`);
        process.exitCode = 1;
      });
      app.server.listen(config.port, config.host, () => {
        console.log(`Local API: http://${config.host}:${config.port}（このウィンドウのまま利用してください）`);
      });
    });
  });
}

export async function runCli(args) {
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(VERSION);
    return;
  }
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: deepseek-coding-companion [--version|--background|recovery-token]\nWindows/macOS local workspace bridge (127.0.0.1:47831)");
    return;
  }
  if (args[0] === "recovery-token") {
    const config = loadCompanionConfig();
    console.log(ensureState(config));
    return;
  }
  if (args[0] === "attach") return claimAndRun(args[1], Number(args[2] || DEFAULT_PORT));
  const background = args.includes("--background");
  const config = loadCompanionConfig();
  const app = createCompanionServer(config);
  app.server.listen(config.port, config.host, () => {
    console.log(`DeepSeek Coding Companion ${VERSION}`);
    console.log(`Local API: http://${config.host}:${config.port}`);
    console.log("AI Coding本番サイトから自動接続します。通常はtoken入力不要です。");
    console.log("復旧時だけ recovery-token コマンドを管理者の案内に従って使用してください。");
    if (!background && process.stdin.isTTY) promptBackground(app, config);
  });
}
