import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "1.0.0";
const DEFAULT_PORT = 47831;
const SESSION_TTL_MS = 60_000;
const PROFILES = new Set(["safe", "development", "autonomous", "deep-debug"]);
const DEFAULT_ORIGINS = new Set([
  "https://ai-coding.mirai-dx-platform.com",
  "http://127.0.0.1:8877",
  "http://localhost:8877",
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
    "*": "ask", "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git branch*": "allow",
    "npm test*": "allow", "npm run *": "allow", "pnpm test*": "allow", "pnpm run *": "allow",
    "node *": "allow", "python *": "allow", "python3 *": "allow", "pytest*": "allow", "go test*": "allow", "cargo test*": "allow",
    "sudo*": "deny", "su *": "deny", "mount*": "deny", "umount*": "deny", "systemctl*": "deny", "shutdown*": "deny",
    "reboot*": "deny", "mkfs*": "deny", "fdisk*": "deny", "iptables*": "deny", "nft*": "deny", "useradd*": "deny", "passwd*": "deny",
    "rm -rf /": "deny", "rm -rf /*": "deny",
  };
  if (profile === "autonomous") { bash["git add *"] = "allow"; bash["git commit *"] = "allow"; }
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
  return typeof value === "string" && value.length <= 160 && !/[/@:\x00-\x1f]/.test(value);
}

function assertSafeWorkspace(candidate) {
  const canonical = fs.realpathSync(candidate);
  const root = path.parse(canonical).root;
  const denied = new Set([root, os.homedir()]);
  if (process.platform === "win32") {
    for (const name of ["Windows", "Program Files", "Program Files (x86)", "Users"]) denied.add(path.join(root, name));
  } else {
    for (const name of ["/Applications", "/Library", "/System", "/Users", "/Volumes"]) denied.add(name);
  }
  const folded = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const blocked = [...denied].some((item) => (process.platform === "win32" ? item.toLowerCase() : item) === folded);
  if (blocked) throw new Error("ディスクRoot、ユーザーHome全体またはOS領域はWorkspaceに選択できません");
  if (!fs.statSync(canonical).isDirectory()) throw new Error("選択対象はフォルダではありません");
  return canonical;
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

function openSmbNative({ host, share, user = "" }, platform = process.platform) {
  if (!validSmbTarget(host) || !validSmbPart(share) || !validSmbUser(user)) {
    throw new Error("SMB接続先、共有名またはユーザー名の形式が正しくありません");
  }
  if (platform === "win32") {
    const child = spawn("explorer.exe", [`\\\\${host}\\${share}`], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { uri: `\\\\${host}\\${share}`, credentialUi: "Windows" };
  }
  if (platform === "darwin") {
    const authority = user ? `${encodeURIComponent(user)}@${host}` : host;
    const uri = `smb://${authority}/${encodeURIComponent(share)}`;
    const child = spawn("open", [uri], { detached: true, stdio: "ignore" });
    child.unref();
    return { uri: `smb://${host}/${share}`, credentialUi: "macOS" };
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
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(config.tokenFile)) {
    fs.writeFileSync(config.tokenFile, crypto.randomBytes(32).toString("base64url") + "\n", { mode: 0o600, flag: "wx" });
  }
  const token = fs.readFileSync(config.tokenFile, "utf8").trim();
  if (token.length < 24) throw new Error("Companion pairing token is invalid");
  fs.mkdirSync(config.runtimeConfigDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(config.runtimeConfigDir, "oh-my-opencode.json"), JSON.stringify(OMO_CONFIG, null, 2) + "\n", { mode: 0o600 });
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

export function createCompanionServer(config, dependencies = {}) {
  const token = dependencies.token || ensureState(config);
  const pickFolder = dependencies.pickFolder || (() => pickFolderNative());
  const openSmb = dependencies.openSmb || ((body) => openSmbNative(body));
  const launchTerminal = dependencies.launchTerminal || ((id) => launchAttachTerminal(id, config.port));
  const inspectOpenCode = dependencies.inspectOpenCode || (() => inspectOpenCodeNative());
  const workspaces = new Map();
  const sessions = new Map();

  function authenticated(req) {
    return tokenMatches(token, req.headers["x-companion-token"]);
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
    if (!authenticated(req)) return json(res, 401, { ok: false, error: "Companion pairing tokenが必要です" }, origin);
    try {
      if (req.method === "GET" && url.pathname === "/v1/status") {
        return json(res, 200, { ok: true, version: VERSION, platform: process.platform, paired: true, workspaceCount: workspaces.size }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/workspaces/pick") {
        const selected = await pickFolder();
        if (!selected) return json(res, 409, { ok: false, error: "フォルダ選択をキャンセルしました" }, origin);
        const canonical = assertSafeWorkspace(selected);
        const id = crypto.randomUUID();
        workspaces.set(id, { path: canonical, createdAt: Date.now() });
        return json(res, 200, { ok: true, workspace: { id, name: path.basename(canonical), path: canonical, git: fs.existsSync(path.join(canonical, ".git")) } }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/smb/open") {
        const body = await readBody(req);
        if (Object.hasOwn(body, "password")) return json(res, 400, { ok: false, error: "SMBパスワードはブラウザへ入力せず、OSの認証画面を使用してください" }, origin);
        const result = await openSmb({ host: String(body.host || ""), share: String(body.share || ""), user: String(body.user || "") });
        return json(res, 200, { ok: true, ...result, next: "OSで接続後、SMBフォルダを選択してください" }, origin);
      }
      if (req.method === "POST" && url.pathname === "/v1/sessions/launch") {
        const body = await readBody(req);
        const workspace = workspaces.get(String(body.workspaceId || ""));
        if (!workspace) return json(res, 404, { ok: false, error: "Workspace選択が期限切れです。再選択してください" }, origin);
        const currentPath = assertSafeWorkspace(workspace.path);
        if (currentPath !== workspace.path) return json(res, 409, { ok: false, error: "Workspaceの実体が選択後に変更されました。再選択してください" }, origin);
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
        sessions.set(sessionId, { workspace, profile, apiKey, binary: runtime.binary, timer });
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
        const claim = { ok: true, workspace: session.workspace.path, profile: session.profile, binary: session.binary, deepseekApiKey: session.apiKey };
        session.apiKey = "";
        return json(res, 200, claim);
      }
      return json(res, 404, { ok: false, error: "Not Found" }, origin);
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message }, origin);
    }
  });
  return { server, token, workspaces, sessions };
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
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (/^(OPENAI|ANTHROPIC|GOOGLE|GEMINI|AZURE_OPENAI|GITHUB_COPILOT|XAI|OPENROUTER|MOONSHOT|MISTRAL|COHERE|AWS)_.+(KEY|TOKEN|SECRET|CREDENTIAL)/i.test(key)
      || /^(HTTP|HTTPS|ALL)_PROXY$/i.test(key)
      || /^(OMO|OCX)_PROFILE$/i.test(key)) delete childEnv[key];
  }
  childEnv.DEEPSEEK_API_KEY = body.deepseekApiKey;
  childEnv.DEEPSEEK_SESSION_MODE = body.profile;
  childEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify(openCodeConfig(body.profile));
  childEnv.OPENCODE_CONFIG_DIR = config.runtimeConfigDir;
  const args = body.profile === "safe" ? [] : ["--auto"];
  const child = spawn(body.binary, args, {
    cwd: body.workspace,
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });
  const exitCode = await new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
  process.exitCode = exitCode;
}

export async function runCli(args) {
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(VERSION);
    return;
  }
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: deepseek-coding-companion [--version]\nWindows/macOS local workspace bridge (127.0.0.1:47831)");
    return;
  }
  if (args[0] === "attach") return claimAndRun(args[1], Number(args[2] || DEFAULT_PORT));
  const config = loadCompanionConfig();
  const app = createCompanionServer(config);
  app.server.listen(config.port, config.host, () => {
    console.log(`DeepSeek Coding Companion ${VERSION}`);
    console.log(`Local API: http://${config.host}:${config.port}`);
    console.log(`Pairing token: ${app.token}`);
    console.log("このtokenはAI Codingの設定画面だけに入力してください。SMBパスワードではありません。");
  });
}
