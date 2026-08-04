// プロジェクト検出共通ロジック
// 判定基準 C: Gitリポジトリ (.git) かつ bootstrap 済み (.ai-startup-tools/) の両方を持つフォルダ

import fs from "node:fs";
import path from "node:path";

export function isProjectDir(dir) {
  return (
    fs.existsSync(path.join(dir, ".git")) &&
    fs.existsSync(path.join(dir, ".ai-startup-tools"))
  );
}

/**
 * ルート直下のプロジェクトを列挙する。
 * @param {string} root
 * @returns {Array<{name: string, path: string}>}
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
    if (isProjectDir(full)) {
      results.push({ name: entry.name, path: full });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/**
 * candidate が root 配下かを判定する (大文字小文字を無視、Windowsパス対応)。
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInsideRoot(root, candidate) {
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  return c === r || c.startsWith(r + path.sep);
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
