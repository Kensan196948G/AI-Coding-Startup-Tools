// SSH 経由の Windows リモート実行 (Linux → Windows)

import { spawnSync } from "node:child_process";

/**
 * ssh を実行して結果を返す。コマンドはサーバー側で組み立てたものだけを許可する。
 * @param {string} host
 * @param {string} user
 * @param {string} command リモートで実行するコマンド文字列
 * @param {{timeout?: number}} opts
 * @returns {{ok: boolean, status: number|null, stdout: string, stderr: string}}
 */
export function runSsh(host, user, command, opts = {}) {
  const args = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
  ];
  if (user) {
    args.push(`${user}@${host}`);
  } else {
    args.push(host);
  }
  args.push(command);

  const res = spawnSync("ssh", args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 30000,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}
