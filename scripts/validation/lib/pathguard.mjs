// パス安全検証共通ライブラリ

import fs from "node:fs";
import path from "node:path";

export class PathGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PathGuardError";
    this.code = code;
  }
}

/**
 * ルート配下への出力パスを安全に解決する。
 * 絶対パス・.. ・シンボリックリンク経由のルート外書込みを拒否する。
 * @param {string} root
 * @param {string} relative
 * @returns {string}
 */
export function resolveSafeOutput(root, relative) {
  if (path.isAbsolute(relative)) {
    throw new PathGuardError("SECURITY", `出力パスは相対パスで指定してください: ${relative}`);
  }
  if (relative.split(/[\\/]/).includes("..")) {
    throw new PathGuardError("SECURITY", `出力パスに '..' を含めることはできません: ${relative}`);
  }
  const rootFull = path.resolve(root);
  const candidate = path.resolve(rootFull, relative);
  if (candidate !== rootFull && !candidate.startsWith(rootFull + path.sep)) {
    throw new PathGuardError("SECURITY", `出力パスがプロジェクトルート外です: ${relative}`);
  }

  // 既存コンポーネントのシンボリックリンク検査
  let current = rootFull;
  const parts = candidate.slice(rootFull.length).split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        const real = fs.realpathSync(current);
        if (real !== rootFull && !real.startsWith(rootFull + path.sep)) {
          throw new PathGuardError("SECURITY", `シンボリックリンクがルート外を指しています: ${relative}`);
        }
      }
    } catch (error) {
      if (error instanceof PathGuardError) {
        throw error;
      }
      // 存在しないコンポーネントは無視
    }
  }
  return candidate;
}
