// 設定ファイルのスキーマ検証

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compileValidator, formatErrors, loadYamlFile } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CASES = [
  ["common/config/defaults.yml", "common/schemas/defaults.schema.json"],
  ["common/config/compatibility.yml", "common/schemas/compatibility.schema.json"],
  ["common/config/logging.yml", "common/schemas/logging.schema.json"],
  ["common/config/deepseek-runtime.yml", "common/schemas/deepseek-runtime.schema.json"],
  ["deepseek/models/logical-models.yml", "common/schemas/deepseek-models.schema.json"],
];

let failed = 0;

for (const [yamlRel, schemaRel] of CASES) {
  const yamlPath = path.join(ROOT, yamlRel);
  const schemaPath = path.join(ROOT, schemaRel);
  const data = loadYamlFile(yamlPath);
  const validate = compileValidator(schemaPath);
  if (!validate(data)) {
    console.error(`[NG] ${yamlRel}: ${formatErrors(validate.errors)}`);
    failed += 1;
  } else {
    console.log(`[OK] ${yamlRel}`);
  }
}

const providerPath = path.join(ROOT, "deepseek/provider/provider.json");
const providerData = JSON.parse(fs.readFileSync(providerPath, "utf8"));
const validateProvider = compileValidator(path.join(ROOT, "common/schemas/deepseek-provider.schema.json"));
if (!validateProvider(providerData)) {
  console.error(`[NG] deepseek/provider/provider.json: ${formatErrors(validateProvider.errors)}`);
  failed += 1;
} else {
  console.log("[OK] deepseek/provider/provider.json");
}

const { validateDeepSeekRepository } = await import("./validate-deepseek-runtime.mjs");
const deepSeekErrors = validateDeepSeekRepository(ROOT);
if (deepSeekErrors.length > 0) {
  for (const error of deepSeekErrors) console.error(`[NG] DeepSeek runtime: ${error}`);
  failed += deepSeekErrors.length;
} else {
  console.log("[OK] DeepSeek runtime semantic policy");
}

if (failed > 0) {
  console.error(`設定検証に失敗しました: ${failed} 件`);
  process.exit(1);
}
console.log("設定検証: すべて合格");
