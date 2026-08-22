// OpenCode / Oh My OpenCode / DeepSeek-only semantic validation.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadYamlFile } from "./lib/schema.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), "../..");
const EXACT = Object.freeze({
  opencodePackage: "opencode-ai",
  opencodeVersion: "1.18.21",
  agentPackage: "oh-my-opencode",
  agentVersion: "4.19.4",
});
const REQUIRED_AGENTS = Object.freeze([
  "sisyphus", "hephaestus", "prometheus", "oracle", "metis",
  "momus", "atlas", "multimodal-looker", "sisyphus-junior", "explore", "librarian",
]);
const SECRET_READ_PATTERNS = Object.freeze([
  ".env", ".env.*", "*.env", "*.env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", "credentials*", "secrets*",
]);
const LOGICAL_MODELS = Object.freeze({
  "deepseek-pro": "deepseek/deepseek-v4-pro",
  "deepseek-flash": "deepseek/deepseek-v4-flash",
});

function isDeepSeekModel(value) {
  return typeof value === "string" && /^deepseek\/deepseek-[a-z0-9-]+$/.test(value);
}

export function validateRuntimeConfig(runtime) {
  const errors = [];
  for (const [key, expected] of Object.entries(EXACT)) {
    if (runtime?.runtime?.[key] !== expected) errors.push(`runtime.${key} must equal ${expected}`);
  }
  if (runtime?.mode !== "deepseek-only") errors.push("mode must be deepseek-only");
  if (runtime?.provider?.id !== "deepseek") errors.push("provider.id must be deepseek");
  if (runtime?.provider?.credentialEnv !== "DEEPSEEK_API_KEY") errors.push("credentialEnv must name DEEPSEEK_API_KEY");
  if (JSON.stringify(runtime?.provider?.allowedProviders) !== '["deepseek"]') {
    errors.push("provider.allowedProviders must be exactly [deepseek]");
  }
  for (const [logical, expectedModel] of Object.entries(LOGICAL_MODELS)) {
    const model = runtime?.models?.[logical];
    if (model?.provider !== "deepseek" || !isDeepSeekModel(model?.opencodeModel)) {
      errors.push(`models.${logical} must resolve to a DeepSeek model`);
    }
    if (model?.opencodeModel !== expectedModel) {
      errors.push(`models.${logical}.opencodeModel must equal ${expectedModel}`);
    }
    if (model?.apiModelId !== expectedModel.slice("deepseek/".length)) {
      errors.push(`models.${logical}.apiModelId must match ${expectedModel}`);
    }
  }
  for (const [key, value] of Object.entries(runtime?.failClosed ?? {})) {
    if (value !== true) errors.push(`failClosed.${key} must be true`);
  }
  return errors;
}

export function validateOpenCodeProfile(profile, expectedPlugin = "oh-my-opencode@4.19.4") {
  const errors = [];
  if (JSON.stringify(profile?.enabled_providers) !== '["deepseek"]') {
    errors.push("enabled_providers must be exactly [deepseek]");
  }
  if (profile?.disabled_providers?.includes("deepseek")) errors.push("deepseek cannot be disabled");
  if (profile?.provider && Object.keys(profile.provider).some((id) => id !== "deepseek")) {
    errors.push("provider contains a non-DeepSeek provider");
  }
  if (!Array.isArray(profile?.plugin) || profile.plugin.length !== 1 || profile.plugin[0] !== expectedPlugin) {
    errors.push(`plugin must be exactly [${expectedPlugin}]`);
  }
  for (const key of ["model", "small_model"]) {
    if (!isDeepSeekModel(profile?.[key])) errors.push(`${key} must be an explicit DeepSeek model`);
  }
  if (profile?.permission?.external_directory !== "deny") {
    errors.push("permission.external_directory must be deny");
  }
  const read = profile?.permission?.read;
  for (const pattern of SECRET_READ_PATTERNS) {
    if (read?.[pattern] !== "deny") errors.push(`permission.read.${pattern} must be deny`);
  }
  return errors;
}

export function validateAgentConfig(config) {
  const errors = [];
  if (config?.model_fallback !== false) errors.push("model_fallback must be false");
  if (config?.runtime_fallback !== false) errors.push("runtime_fallback must be false");
  if (config?.auto_update !== false) errors.push("auto_update must be false for an exact runtime pin");
  if (config?.disabled_providers?.includes("deepseek")) errors.push("deepseek cannot be disabled by the agent plugin");
  for (const name of REQUIRED_AGENTS) {
    const agent = config?.agents?.[name];
    if (!agent) {
      errors.push(`agent ${name} has no explicit assignment`);
      continue;
    }
    if (!isDeepSeekModel(agent.model)) errors.push(`agent ${name} model must be DeepSeek`);
    if ("models" in agent || "fallback_models" in agent) {
      errors.push(`agent ${name} must not define a fallback chain`);
    }
  }
  for (const [name, agent] of Object.entries(config?.agents ?? {})) {
    if (!isDeepSeekModel(agent?.model)) errors.push(`agent ${name} model must be DeepSeek`);
  }
  for (const [name, category] of Object.entries(config?.categories ?? {})) {
    if (!isDeepSeekModel(category?.model)) errors.push(`category ${name} model must be DeepSeek`);
    if ("models" in category || "fallback_models" in category) {
      errors.push(`category ${name} must not define a fallback chain`);
    }
  }
  return errors;
}

export function validateDeepSeekRepository(root = ROOT) {
  const runtime = loadYamlFile(path.join(root, "common/config/deepseek-runtime.yml"));
  const errors = validateRuntimeConfig(runtime);
  const expectedPlugin = `${runtime.runtime.agentPackage}@${runtime.runtime.agentVersion}`;
  for (const relative of runtime.profiles.opencode) {
    const profile = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    errors.push(...validateOpenCodeProfile(profile, expectedPlugin).map((e) => `${relative}: ${e}`));
  }
  const agentConfig = JSON.parse(fs.readFileSync(path.join(root, runtime.profiles.agent), "utf8"));
  errors.push(...validateAgentConfig(agentConfig).map((e) => `${runtime.profiles.agent}: ${e}`));
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  const errors = validateDeepSeekRepository();
  if (errors.length > 0) {
    for (const error of errors) console.error(`[NG] ${error}`);
    console.error(`DeepSeek runtime validation failed: ${errors.length}`);
    process.exit(1);
  }
  console.log("[OK] OpenCode provider allowlist: deepseek only");
  console.log("[OK] Oh My OpenCode agents: explicit DeepSeek models, fallback disabled");
  console.log(`[OK] exact pins: opencode-ai@${EXACT.opencodeVersion}, oh-my-opencode@${EXACT.agentVersion}`);
}
