// 移行台帳のスキーマ・出典検証

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compileValidator, formatErrors, loadYamlFile } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ALLOWED_REPOS = [
  "Claude-StartUpTools-New-Linux",
  "Claude-StartUpTools-New-Windows",
  "ClaudeCode-StartUpTools-New",
  "Codex-StartUpTools",
  "Codex-StartUpTools-New-Linux",
  "Codex-StartUpTools-New-Windows",
  "ClaudeCode-System-Development-Documents",
];

const inventoryPath = path.join(ROOT, "docs/migration/inventory.yml");
const validate = compileValidator(path.join(ROOT, "common/schemas/migration-inventory.schema.json"));
const data = loadYamlFile(inventoryPath);

let failed = 0;
if (!validate(data)) {
  console.error(`[NG] docs/migration/inventory.yml: ${formatErrors(validate.errors)}`);
  failed += 1;
}

for (const asset of data.assets ?? []) {
  if (!ALLOWED_REPOS.includes(asset.sourceRepository)) {
    console.error(`[NG] 未知の統合元リポジトリ: ${asset.sourceRepository}`);
    failed += 1;
  }
  if (["merge", "unify", "platform-specific", "tool-specific"].includes(asset.decision) && !asset.targetPath) {
    console.error(`[NG] ${asset.sourcePath}: 採用系 decision には targetPath が必要です`);
    failed += 1;
  }
  if (asset.decision === "sensitive" && !["rejected", "quarantined"].includes(asset.status)) {
    console.error(`[NG] ${asset.sourcePath}: sensitive の status は rejected / quarantined にしてください`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`移行台帳検証に失敗しました: ${failed} 件`);
  process.exit(1);
}
console.log(`移行台帳検証: ${data.assets?.length ?? 0} 件すべて合格`);
