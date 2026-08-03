// 設定ファイルのスキーマ検証

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compileValidator, formatErrors, loadYamlFile, walkFiles } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CASES = [
  ["common/config/defaults.yml", "common/schemas/defaults.schema.json"],
  ["common/config/compatibility.yml", "common/schemas/compatibility.schema.json"],
  ["common/config/logging.yml", "common/schemas/logging.schema.json"],
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

const profileDirs = ["claude-code/common/profiles", "codex/common/profiles"];
const validateProfile = compileValidator(path.join(ROOT, "common/schemas/profile.schema.json"));
for (const dir of profileDirs) {
  const dirPath = path.join(ROOT, dir);
  for (const file of walkFiles(dirPath, (f) => f.endsWith(".yml"))) {
    const data = loadYamlFile(file);
    if (!validateProfile(data)) {
      console.error(`[NG] ${path.relative(ROOT, file)}: ${formatErrors(validateProfile.errors)}`);
      failed += 1;
    } else {
      console.log(`[OK] ${path.relative(ROOT, file)}`);
    }
  }
}

if (failed > 0) {
  console.error(`設定検証に失敗しました: ${failed} 件`);
  process.exit(1);
}
console.log("設定検証: すべて合格");
