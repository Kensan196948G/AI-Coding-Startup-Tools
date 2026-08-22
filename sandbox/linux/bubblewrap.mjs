import fs from "node:fs";
import path from "node:path";
import { isSecretPath } from "../../workspace/validation/workspace-validator.mjs";

function existingSecretMounts(workspace) {
  const mounts = [];
  const pending = [workspace];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(workspace, absolute);
      if (isSecretPath(absolute)) {
        mounts.push({ relative, directory: entry.isDirectory() && !entry.isSymbolicLink() });
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(absolute);
    }
  }
  return mounts;
}

/**
 * Workspaceだけを書込み可能にするbubblewrap argvを生成する。
 * 呼出側は事前にWorkspace/command policyを検証し、このargvをshell=falseでspawnする。
 */
export function buildBubblewrapArgs({ workspace, command, network = false, clearEnvironment = true, readOnlyBinds = [] }) {
  if (!workspace || !fs.statSync(workspace).isDirectory()) {
    throw new TypeError("検証済みの実在Workspaceが必要です");
  }
  if (!Array.isArray(command) || command.length === 0) {
    throw new TypeError("command argvが必要です");
  }

  const args = ["--die-with-parent", "--new-session", "--unshare-all"];
  if (network) args.push("--share-net");
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  for (const runtime of ["/usr", "/bin", "/lib", "/lib64"]) {
    if (fs.existsSync(runtime)) args.push("--ro-bind", runtime, runtime);
  }
  for (const binding of readOnlyBinds) {
    if (!binding || !fs.existsSync(binding.source) || typeof binding.destination !== "string") {
      throw new TypeError("readOnlyBindsには実在sourceとdestinationが必要です");
    }
    args.push("--ro-bind", binding.source, binding.destination);
  }
  args.push(
    "--dir",
    "/workspace",
    "--bind",
    workspace,
    "/workspace",
  );
  // Workspaceをbindした後にSecretを空のmountで覆い、子processからも読めなくする。
  for (const secret of existingSecretMounts(workspace)) {
    const destination = path.posix.join("/workspace", ...secret.relative.split(path.sep));
    if (secret.directory) args.push("--tmpfs", destination);
    else args.push("--ro-bind", "/dev/null", destination);
  }
  args.push(
    "--chdir",
    "/workspace",
    ...(clearEnvironment ? ["--clearenv"] : []),
    "--setenv",
    "HOME",
    "/workspace",
    "--setenv",
    "PATH",
    "/usr/local/bin:/usr/bin:/bin",
    "--",
    ...command,
  );
  return args;
}
