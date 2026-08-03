// スキーマ検証共通ライブラリ

import fs from "node:fs";
import path from "node:path";
import YAML from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

export function loadYamlFile(file) {
  return YAML.load(fs.readFileSync(file, "utf8"), { schema: YAML.CORE_SCHEMA });
}

export function compileValidator(schemaPath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  return ajv.compile(schema);
}

export function formatErrors(errors) {
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

export function walkFiles(root, predicate) {
  const results = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}
