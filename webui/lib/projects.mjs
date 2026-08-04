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
