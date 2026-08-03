// プロンプトレンダリング共通ライブラリ (安全な文字列置換)

import YAML from "js-yaml";

export function parsePrompt(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    throw new Error("Front Matter がありません");
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) {
    throw new Error("Front Matter の終端 '---' が見つかりません");
  }
  const front = text.slice(3, end).trim();
  const body = text.slice(end + 4);
  return { meta: YAML.load(front, { schema: YAML.CORE_SCHEMA }), body };
}

/**
 * 変数を文字列置換でレンダリングする。式評価・Shell 展開は行わない。
 * 未解決・未宣言の変数があればエラーにする。
 * @param {string} raw
 * @param {Record<string, string>} vars
 * @returns {{ meta: object, body: string }}
 */
export function renderPrompt(raw, vars = {}) {
  const { meta, body } = parsePrompt(raw);
  const used = [...new Set([...body.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]))];
  const declared = new Set(meta.variables ?? []);
  const undeclared = used.filter((v) => !declared.has(v));
  if (undeclared.length > 0) {
    throw new Error(`未宣言の変数があります: ${undeclared.join(", ")}`);
  }
  const missing = used.filter((v) => !(v in vars));
  if (missing.length > 0) {
    throw new Error(`未解決の変数があります: ${missing.join(", ")}`);
  }
  let out = body;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  const leftover = [...new Set([...out.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]))];
  if (leftover.length > 0) {
    throw new Error(`未解決の変数が残っています: ${leftover.join(", ")}`);
  }
  return { meta, body: out };
}
