// リポジトリ内の秘密情報パターン簡易スキャン

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { walkFiles } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PATTERNS = [
  /(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const IGNORE_DIRS = new Set(["node_modules", ".git", "tests/fixtures"]);
const IGNORE_FILES = new Set([
  "common/config/logging.yml",
  "scripts/validation/lib/redact.mjs",
  "package-lock.json",
]);
const IGNORE_LINE = /dummy|example|redact|pattern|schema/i;

const files = walkFiles(ROOT, (f) => !IGNORE_FILES.has(path.relative(ROOT, f)));
let findings = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const parts = rel.split(path.sep);
  if (parts.some((p) => IGNORE_DIRS.has(p))) {
    continue;
  }
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue; // バイナリ等
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (IGNORE_LINE.test(lines[i])) {
      continue;
    }
    for (const pattern of PATTERNS) {
      if (pattern.test(lines[i])) {
        console.error(`[SECRET] ${rel}:${i + 1}: 秘密情報らしきパターンを検出`);
        findings += 1;
      }
    }
  }
}

if (findings > 0) {
  console.error(`秘密情報スキャンに失敗しました: ${findings} 件`);
  process.exit(1);
}
console.log("秘密情報スキャン: 検出なし");
