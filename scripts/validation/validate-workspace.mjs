#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  WorkspaceValidationError,
  validateWorkspaceSelection,
} from "../../workspace/validation/workspace-validator.mjs";

const VALUE_OPTIONS = new Set(["--workspace", "--storage", "--local-root", "--smb-root"]);

export function parseWorkspaceArgs(argv) {
  const parsed = { workspacePath: null, storageType: null, localRoots: [], smbRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") return { ...parsed, help: true };
    if (!VALUE_OPTIONS.has(option)) {
      throw new WorkspaceValidationError("UNKNOWN_OPTION", `不明なオプションです: ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new WorkspaceValidationError("MISSING_VALUE", `${option}の値が必要です`);
    }
    index += 1;
    if (option === "--workspace") {
      if (parsed.workspacePath !== null) {
        throw new WorkspaceValidationError("DUPLICATE_OPTION", "--workspaceは1回だけ指定してください");
      }
      parsed.workspacePath = value;
    } else if (option === "--storage") {
      if (parsed.storageType !== null) {
        throw new WorkspaceValidationError("DUPLICATE_OPTION", "--storageは1回だけ指定してください");
      }
      parsed.storageType = value;
    } else if (option === "--local-root") {
      parsed.localRoots.push(value);
    } else {
      parsed.smbRoots.push(value);
    }
  }
  return parsed;
}
export function validateWorkspaceFromArgs(argv) {
  const parsed = parseWorkspaceArgs(argv);
  if (parsed.help) return parsed;
  if (!parsed.workspacePath || !parsed.storageType) {
    throw new WorkspaceValidationError(
      "MISSING_REQUIRED_OPTION",
      "--workspaceと--storageは必須です",
    );
  }
  const allowedRoots = [
    ...parsed.localRoots.map((root) => ({ type: "local", path: root })),
    ...parsed.smbRoots.map((root) => ({ type: "smb", path: root })),
  ];
  return validateWorkspaceSelection({
    workspacePath: parsed.workspacePath,
    storageType: parsed.storageType,
    allowedRoots,
  });
}

function usage() {
  return [
    "Usage:",
    "  validate-workspace.mjs --workspace PATH --storage local|smb \\",
    "    [--local-root PATH ...] [--smb-root PATH ...]",
    "",
    "SMB RootはLinux上で既にmount済みの場合だけ許可されます。",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = validateWorkspaceFromArgs(argv);
    if (result.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    process.stdout.write(`${result.workspace}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof WorkspaceValidationError ? error.code : "INTERNAL_ERROR";
    process.stderr.write(`Workspace validation failed [${code}]: ${error.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
