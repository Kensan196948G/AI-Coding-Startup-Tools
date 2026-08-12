// プロジェクト検出共通ロジック
// WebUI は Git リポジトリ (.git) をすべて表示し、bootstrap 済み (.ai-startup-tools/) は
// 状態バッジとして区別する。コンソールの select-project は起動対象のため両方必須のまま。

import fs from "node:fs";
import path from "node:path";

export function isGitProject(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

export function isBootstrapped(dir) {
  return fs.existsSync(path.join(dir, ".ai-startup-tools"));
}

/**
 * コンソール選択ツール向けの判定 (Git リポジトリ かつ bootstrap 済み)。
 * @param {string} dir
 * @returns {boolean}
 */
export function isProjectDir(dir) {
  return isGitProject(dir) && isBootstrapped(dir);
}

/**
 * ルート直下の Git リポジトリを列挙する。
 * @param {string} root
 * @returns {Array<{name: string, path: string, bootstrapped: boolean}>}
 */
export function listProjects(root) {
  if (!root || !fs.existsSync(root)) {
    return [];
  }
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(root, entry.name);
    if (isGitProject(full)) {
      results.push({ name: entry.name, path: full, bootstrapped: isBootstrapped(full) });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/**
 * パスを実体 (シンボリックリンク解決後) に正規化する。
 * 存在しない末端は、最も近い既存の祖先を realpath した結果に連結して返す。
 * @param {string} p
 * @returns {string}
 */
export function canonicalizePath(p) {
  const absolute = path.resolve(p);
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      return absolute;
    }
    existing = parent;
  }
  try {
    return fs.realpathSync(existing) + absolute.slice(existing.length);
  } catch {
    return absolute;
  }
}

/**
 * candidate が root 配下かを判定する (シンボリックリンク解決後、Windowsパス対応は文字列ベース)。
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInsideRoot(root, candidate) {
  const r = canonicalizePath(root);
  const c = canonicalizePath(candidate);
  return c === r || c.startsWith(r + path.sep);
}

/**
 * candidate が root 配下かを判定し、配下なら canonicalize 済みパスを返す。
 * ルート外・解決不能の場合は null を返す。
 * @param {string} root
 * @param {string} candidate
 * @returns {string|null}
 */
export function resolveInsideRoot(root, candidate) {
  const canonical = canonicalizePath(candidate);
  return isInsideRoot(root, canonical) ? canonical : null;
}

/**
 * Windows 側プロジェクトパスの検証 (文字列ベース・大文字小文字無視)。
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInsideWindowsRoot(root, candidate) {
  const normalize = (p) => p.replace(/[\\/]+/g, "\\").replace(/\\$/, "").toLowerCase();
  const r = normalize(root);
  const c = normalize(candidate);
  return c === r || c.startsWith(r + "\\");
}

// ドライブレター + バックスラッシュ区切りの英数字・空白・.-_ のみを許可する。
// SSH経由で PowerShell/cmd.exe の二重引用符コマンド文字列へ埋め込むため、
// シェルメタ文字 (" ` $ ; | & < > % ^ 改行など) を一切許可しない。
const WINDOWS_SAFE_PATH_RE = /^[A-Za-z]:\\[A-Za-z0-9 ._-]+(?:\\[A-Za-z0-9 ._-]+)*$/;

/**
 * Windows パス文字列が SSH 経由のリモートコマンドへ安全に埋め込める文字だけで
 * 構成されているかを判定する (コマンドインジェクション対策)。
 * @param {string} candidate
 * @returns {boolean}
 */
export function isSafeWindowsPath(candidate) {
  return typeof candidate === "string" && WINDOWS_SAFE_PATH_RE.test(candidate);
}

/**
 * パス文字列の末尾セグメントを返す (Linux/Windows どちらの区切り文字にも対応)。
 * 複数ルートのラベル表示に使う。
 * @param {string} p
 * @returns {string}
 */
export function basenameOfPath(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || String(p);
}

/**
 * candidate がいずれかの root 配下かを判定する (Linux パス、複数ルート版)。
 * @param {string[]} roots
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInsideAnyRoot(roots, candidate) {
  return roots.some((root) => isInsideRoot(root, candidate));
}

/**
 * candidate がいずれかの root 配下かを判定する (Windows パス、複数ルート版)。
 * @param {string[]} roots
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInsideAnyWindowsRoot(roots, candidate) {
  return roots.some((root) => isInsideWindowsRoot(root, candidate));
}

/**
 * 複数ルートそれぞれのプロジェクト一覧をラベル付きで返す。
 * @param {string[]} roots
 * @returns {Array<{root: string, label: string, projects: Array<{name: string, path: string}>}>}
 */
export function listProjectsForRoots(roots) {
  return roots.map((root) => ({
    root,
    label: basenameOfPath(root),
    projects: listProjects(root),
  }));
}
