import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { buildBubblewrapArgs } from "./bubblewrap.mjs";

function fail(message) {
  process.stderr.write(`[ERROR] ${message}\n`);
  process.exit(2);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const workspace = option("--workspace");
const profilePath = option("--profile-config");
const toolRoot = option("--tool-root");
const executable = option("--opencode");
const runtimeRoot = option("--runtime-root");
const auto = process.argv.includes("--auto");

for (const [label, value] of Object.entries({ workspace, profilePath, toolRoot, executable, runtimeRoot })) {
  if (!value || !path.isAbsolute(value) || !fs.existsSync(value)) fail(`${label}が不正です`);
}
if (!process.env.DEEPSEEK_API_KEY) fail("DEEPSEEK_API_KEYが設定されていません");

const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
if (JSON.stringify(profile.enabled_providers) !== '["deepseek"]') fail("Provider allowlistがDeepSeek専用ではありません");

const stateRoot = path.join(workspace, ".deepseek-coding-tools", "runtime");
const home = path.join(stateRoot, "home");
const configDir = path.join(home, ".config", "opencode");
for (const directory of [home, configDir, path.join(stateRoot, "cache"), path.join(stateRoot, "data")]) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
}
fs.copyFileSync(path.join(toolRoot, "oh-my-opencode", "deepseek-only.json"), path.join(configDir, "oh-my-opencode.json"));

const command = [executable];
if (auto) command.push("--auto");
command.push("/workspace");
const args = buildBubblewrapArgs({
  workspace,
  command,
  network: true,
  clearEnvironment: false,
  readOnlyBinds: [
    { source: toolRoot, destination: "/tool" },
    { source: runtimeRoot, destination: runtimeRoot },
  ],
});

const sanitizedEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  HOME: "/workspace/.deepseek-coding-tools/runtime/home",
  XDG_CONFIG_HOME: "/workspace/.deepseek-coding-tools/runtime/home/.config",
  XDG_CACHE_HOME: "/workspace/.deepseek-coding-tools/runtime/cache",
  XDG_DATA_HOME: "/workspace/.deepseek-coding-tools/runtime/data",
  OPENCODE_CONFIG_CONTENT: JSON.stringify(profile),
  PATH: "/usr/local/bin:/usr/bin:/bin",
  LANG: process.env.LANG || "C.UTF-8",
  TERM: process.env.TERM || "xterm-256color",
  SHELL: "/bin/bash",
  USER: "deepseek-code",
};

const child = spawn("bwrap", args, { stdio: "inherit", env: sanitizedEnv });
child.on("error", (error) => fail(`bubblewrapを起動できません: ${error.message}`));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
