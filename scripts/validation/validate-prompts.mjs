// プロンプトの Front Matter・変数・承認ゲート検証

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";
import { compileValidator, formatErrors, walkFiles } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMPT_ROOT = path.join(ROOT, "prompts");
const validatePrompt = compileValidator(path.join(ROOT, "common/schemas/prompt.schema.json"));

const FORBIDDEN = [
  { pattern: /\beval\s*\(/i, name: "eval" },
  { pattern: /Invoke-Expression/i, name: "Invoke-Expression" },
  { pattern: /curl\s+[^|]*\|\s*(ba)?sh/i, name: "curl-pipe-sh" },
  { pattern: /wget\s+[^|]*\|\s*(ba)?sh/i, name: "wget-pipe-sh" },
];

function parsePrompt(file) {
  const raw = file.replace(/^\uFEFF/, "");
  if (!raw.startsWith("---")) {
    return null;
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) {
    throw new Error("Front Matter の終端 '---' が見つかりません");
  }
  const front = raw.slice(3, end).trim();
  const body = raw.slice(end + 4);
  return { meta: YAML.load(front, { schema: YAML.CORE_SCHEMA }), body };
}

const files = walkFiles(PROMPT_ROOT, (f) => f.endsWith(".md") && !f.endsWith("README.md"));
let failed = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  let parsed;
  try {
    parsed = parsePrompt(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`[NG] ${rel}: ${error.message}`);
    failed += 1;
    continue;
  }
  if (!parsed) {
    console.error(`[NG] ${rel}: Front Matter がありません`);
    failed += 1;
    continue;
  }
  if (!validatePrompt(parsed.meta)) {
    console.error(`[NG] ${rel}: ${formatErrors(validatePrompt.errors)}`);
    failed += 1;
    continue;
  }
  console.log(`[OK] ${rel}`);

  const used = new Set(
    [...parsed.body.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]),
  );
  const declared = new Set(parsed.meta.variables);
  const undeclared = [...used].filter((v) => !declared.has(v));
  const unused = [...declared].filter((v) => !used.has(v));
  if (undeclared.length > 0) {
    console.error(`[NG] ${rel}: 未宣言の変数があります: ${undeclared.join(", ")}`);
    failed += 1;
  }
  if (unused.length > 0) {
    console.error(`[NG] ${rel}: 宣言済みだが未使用の変数があります: ${unused.join(", ")}`);
    failed += 1;
  }

  for (const { pattern, name } of FORBIDDEN) {
    if (pattern.test(parsed.body)) {
      console.error(`[NG] ${rel}: 禁止パターンを含みます (${name})`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`プロンプト検証に失敗しました: ${failed} 件`);
  process.exit(1);
}
console.log(`プロンプト検証: ${files.length} ファイルすべて合格`);
