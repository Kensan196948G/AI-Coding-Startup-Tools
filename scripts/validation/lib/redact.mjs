// 秘密値マスキング共通ライブラリ

const REDACT_PATTERNS = [
  /(api[_-]?key|secret|token|password|passwd|authorization|cookie)\s*[=:]\s*[^\s"',;]+/gi,
  /(ghp_|gho_|ghu_|ghs_|ghr_|sk-|xox[baprs]-|AKIA[0-9A-Z]{16})[A-Za-z0-9_\-]+/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/**
 * 入力文字列中の秘密値らしき箇所を [REDACTED] に置き換える。
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  if (typeof text !== "string") {
    return text;
  }
  let out = text;
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function redactJson(value) {
  return JSON.parse(redact(JSON.stringify(value)));
}
