import path from "node:path";

const ALLOWED_EXECUTABLES = new Set([
  "bun",
  "cargo",
  "cmake",
  "git",
  "go",
  "make",
  "node",
  "npm",
  "npx",
  "pnpm",
  "python",
  "python3",
  "pytest",
]);

const FORBIDDEN_EXECUTABLES = new Set([
  "bash",
  "chown",
  "doas",
  "fdisk",
  "iptables",
  "mkfs",
  "mount",
  "nft",
  "passwd",
  "reboot",
  "rm",
  "sh",
  "shutdown",
  "su",
  "sudo",
  "systemctl",
  "umount",
  "useradd",
  "zsh",
]);

const DYNAMIC_CODE_FLAGS = new Map([
  ["node", new Set(["-e", "--eval", "-p", "--print", "--require", "-r"])],
  ["python", new Set(["-c"])],
  ["python3", new Set(["-c"])],
]);

export class CommandPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CommandPolicyError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new CommandPolicyError(code, message);
}

function normalizeArgv(command) {
  if (!Array.isArray(command) || command.length === 0) {
    reject("ARGV_REQUIRED", "shell文字列ではなくargv配列が必要です");
  }
  if (command.some((value) => typeof value !== "string" || value.length === 0 || value.includes("\0"))) {
    reject("INVALID_ARGV", "argvに空値、非文字列、NULは使用できません");
  }
  return [...command];
}

/**
 * 実行要求をargv境界で検査する。shell経由の再解釈は禁止する。
 */
export function validateCommand(command, { session, cwd, allowDocker = false } = {}) {
  const argv = normalizeArgv(command);
  const executable = path.basename(argv[0]).toLowerCase();
  if (argv[0] !== executable) {
    reject("EXECUTABLE_PATH", "実行ファイルはPATH上の許可名だけを指定できます");
  }
  if (FORBIDDEN_EXECUTABLES.has(executable)) {
    reject("FORBIDDEN_COMMAND", `${executable}はSandbox sessionでは禁止されています`);
  }
  const allowed = new Set(ALLOWED_EXECUTABLES);
  if (allowDocker) allowed.add("docker");
  if (!allowed.has(executable)) {
    reject("COMMAND_NOT_ALLOWED", `${executable}は許可コマンドではありません`);
  }
  if (!session) reject("INVALID_SESSION", "検証済みWorkspace sessionが必要です");

  if (typeof session.authorize !== "function") {
    reject("INVALID_SESSION", "検証済みWorkspace sessionが必要です");
  }
  const safeCwd = session.authorize(cwd ?? ".", "read");
  const blockedFlags = DYNAMIC_CODE_FLAGS.get(executable);
  if (blockedFlags && argv.slice(1).some((arg) => blockedFlags.has(arg.split("=")[0]))) {
    reject("DYNAMIC_CODE", `${executable}の動的コード実行オプションは禁止されています`);
  }
  if (executable === "git" && argv[1] === "config" && argv.some((arg) => arg === "--global" || arg === "--system")) {
    reject("SYSTEM_MODIFICATION", "git configのglobal/system変更は禁止されています");
  }
  return Object.freeze({ argv: Object.freeze(argv), cwd: safeCwd });
}
