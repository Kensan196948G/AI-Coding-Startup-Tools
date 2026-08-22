import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_LINUX_ROOTS = new Set([
  "/",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sys",
  "/usr",
  "/var",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa.*$/i,
  /^id_ed25519.*$/i,
  /^credentials.*$/i,
  /^secrets?.*$/i,
];

const SECRET_DIRECTORY_NAMES = new Set([".ssh", ".gnupg", ".aws"]);
const verifiedSelections = new WeakSet();

export class WorkspaceValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceValidationError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new WorkspaceValidationError(code, message);
}

function hasParentReference(value) {
  return String(value).split(/[\\/]+/u).includes("..");
}

function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value)) {
    reject("INVALID_PATH", `${label}には空でない絶対パスが必要です`);
  }
  if (value.includes("\0") || hasParentReference(value)) {
    reject("PATH_TRAVERSAL", `${label}にNULまたは'..'は使用できません`);
  }
}

function canonicalExistingDirectory(value, label) {
  assertAbsolutePath(value, label);
  let stat;
  try {
    stat = fs.lstatSync(value);
  } catch {
    reject("NOT_FOUND", `${label}が存在しません`);
  }
  if (!stat.isDirectory()) {
    reject("NOT_DIRECTORY", `${label}はディレクトリではありません`);
  }
  try {
    return fs.realpathSync(value);
  } catch {
    reject("REALPATH_FAILED", `${label}のrealpathを取得できません`);
  }
}

function isFilesystemRoot(value) {
  return path.parse(value).root === value;
}

function assertSafeStorageRoot(root) {
  if (isFilesystemRoot(root)) {
    reject("DANGEROUS_ROOT", "ファイルシステムルートをStorage Rootには指定できません");
  }
  if (process.platform !== "win32" && FORBIDDEN_LINUX_ROOTS.has(root)) {
    reject("DANGEROUS_ROOT", `${root}はStorage Rootとして広すぎます`);
  }
}

/**
 * Linux mountinfoを使用し、管理者が事前に用意したmount pointだけを認識する。
 * mountやumountは一切実行しない。
 */
export function isExistingLinuxMountPoint(candidate, mountInfoPath = "/proc/self/mountinfo") {
  if (process.platform !== "linux") {
    return false;
  }
  const realCandidate = canonicalExistingDirectory(candidate, "SMB Root");
  let mountInfo;
  try {
    mountInfo = fs.readFileSync(mountInfoPath, "utf8");
  } catch {
    return false;
  }
  return mountInfo.split("\n").some((line) => {
    const fields = line.split(" ");
    if (fields.length < 5) return false;
    const mountPoint = fields[4]
      .replace(/\\040/g, " ")
      .replace(/\\011/g, "\t")
      .replace(/\\134/g, "\\");
    try {
      return fs.realpathSync(mountPoint) === realCandidate;
    } catch {
      return false;
    }
  });
}

/**
 * 許可Storage Root直下にある、実在する単一ProjectをWorkspaceとして固定する。
 */
export function validateWorkspaceSelection({
  workspacePath,
  storageType,
  allowedRoots,
  mountChecker = isExistingLinuxMountPoint,
}) {
  if (storageType !== "local" && storageType !== "smb") {
    reject("INVALID_STORAGE_TYPE", "storageTypeはlocalまたはsmbのみです");
  }
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    reject("NO_ALLOWED_ROOTS", "許可Storage Rootが未設定です");
  }

  const matchingRoots = allowedRoots.filter((entry) => entry?.type === storageType);
  if (matchingRoots.length === 0) {
    reject("NO_ALLOWED_ROOTS", `${storageType}用の許可Storage Rootがありません`);
  }

  assertAbsolutePath(workspacePath, "Workspace");
  let workspaceStat;
  try {
    workspaceStat = fs.lstatSync(workspacePath);
  } catch {
    reject("NOT_FOUND", "Workspaceが存在しません");
  }
  if (workspaceStat.isSymbolicLink()) {
    reject("SYMLINK_WORKSPACE", "シンボリックリンク自体をWorkspaceには選択できません");
  }
  const workspace = canonicalExistingDirectory(workspacePath, "Workspace");
  assertSafeStorageRoot(workspace);

  for (const entry of matchingRoots) {
    const root = canonicalExistingDirectory(entry.path, "Storage Root");
    assertSafeStorageRoot(root);
    if (storageType === "smb" && !mountChecker(root)) {
      continue;
    }
    if (workspace === root) {
      reject("STORAGE_ROOT_SELECTED", "Storage Root全体をWorkspaceには選択できません");
    }
    // Project間横断を構造的に防ぐため、WorkspaceはStorage Rootの直下だけを許可する。
    if (path.dirname(workspace) === root) {
      const selection = Object.freeze({ workspace, storageRoot: root, storageType });
      verifiedSelections.add(selection);
      return selection;
    }
  }

  if (storageType === "smb") {
    reject("SMB_NOT_MOUNTED_OR_OUTSIDE", "Workspaceは許可済みの既存SMB mount直下ではありません");
  }
  reject("OUTSIDE_ALLOWED_ROOT", "Workspaceは許可Storage Root直下ではありません");
}

export function isSecretPath(candidate) {
  const segments = path.resolve(candidate).split(path.sep).filter(Boolean);
  return segments.some(
    (segment) =>
      SECRET_DIRECTORY_NAMES.has(segment.toLowerCase()) ||
      SECRET_FILE_PATTERNS.some((pattern) => pattern.test(segment)),
  );
}

function canonicalizeTarget(candidate) {
  let existing = candidate;
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      reject("REALPATH_FAILED", "対象パスの既存祖先を解決できません");
    }
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  let canonical = fs.realpathSync(existing);
  for (const segment of missing) canonical = path.join(canonical, segment);
  return canonical;
}

/**
 * 選択済みWorkspaceに対するread/write/delete対象を検証する。
 * 戻り値だけを後続処理に渡し、入力文字列を再利用しない。
 */
export function assertPathInWorkspace(session, target, { operation = "read" } = {}) {
  if (!session || !verifiedSelections.has(session)) {
    reject("INVALID_SESSION", "検証済みWorkspace sessionが必要です");
  }
  if (!["read", "write", "delete"].includes(operation)) {
    reject("INVALID_OPERATION", "operationはread/write/deleteのみです");
  }
  if (typeof target !== "string" || target.length === 0 || target.includes("\0")) {
    reject("INVALID_PATH", "対象パスが不正です");
  }
  if (hasParentReference(target)) {
    reject("PATH_TRAVERSAL", "対象パスに'..'は使用できません");
  }

  const lexical = path.isAbsolute(target) ? path.resolve(target) : path.resolve(session.workspace, target);
  if (isSecretPath(lexical)) {
    reject("SECRET_PATH", "Secret pathへのアクセスは拒否されました");
  }
  const canonical = canonicalizeTarget(lexical);
  if (isSecretPath(canonical)) {
    reject("SECRET_PATH", "Secret pathへのアクセスは拒否されました");
  }
  const relative = path.relative(session.workspace, canonical);
  if (relative === "" && operation === "delete") {
    reject("WORKSPACE_DELETE", "Workspace Root自体は削除できません");
  }
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    reject("OUTSIDE_WORKSPACE", "対象パスは選択済みWorkspace外です");
  }
  return canonical;
}
