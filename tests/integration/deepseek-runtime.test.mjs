import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateAgentConfig,
  validateDeepSeekRepository,
  validateOpenCodeProfile,
  validateRuntimeConfig,
} from "../../scripts/validation/validate-deepseek-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("repository runtime is DeepSeek-only and exactly pinned", () => {
  assert.deepEqual(validateDeepSeekRepository(ROOT), []);
});

test("OpenCode rejects a non-DeepSeek provider or model", () => {
  const invalid = {
    plugin: ["oh-my-opencode@4.19.4"],
    enabled_providers: ["deepseek", "openai"],
    model: "openai/gpt-example",
    small_model: "deepseek/deepseek-v4-flash",
    permission: { external_directory: "deny", read: Object.fromEntries([
      ".env", ".env.*", "*.env", "*.env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", "credentials*", "secrets*",
    ].map((key) => [key, "deny"])) },
  };
  const errors = validateOpenCodeProfile(invalid);
  assert.ok(errors.some((error) => error.includes("enabled_providers")));
  assert.ok(errors.some((error) => error.includes("model must")));
});

test("agent validation fails closed on an unassigned agent and fallback", () => {
  const invalid = {
    auto_update: false,
    model_fallback: true,
    runtime_fallback: false,
    agents: { sisyphus: { model: "deepseek/deepseek-v4-pro" } },
  };
  const errors = validateAgentConfig(invalid);
  assert.ok(errors.some((error) => error.includes("model_fallback")));
  assert.ok(errors.some((error) => error.includes("hephaestus")));
});

test("runtime validation rejects floating versions", () => {
  const invalid = {
    mode: "deepseek-only",
    runtime: {
      opencodePackage: "opencode-ai",
      opencodeVersion: "latest",
      agentPackage: "oh-my-opencode",
      agentVersion: "latest",
    },
    provider: { id: "deepseek", credentialEnv: "DEEPSEEK_API_KEY", allowedProviders: ["deepseek"] },
    models: {
      "deepseek-pro": { provider: "deepseek", opencodeModel: "deepseek/deepseek-v4-pro" },
      "deepseek-flash": { provider: "deepseek", opencodeModel: "deepseek/deepseek-v4-flash" },
    },
    failClosed: {
      rejectUnknownProvider: true,
      rejectUnassignedAgent: true,
      rejectModelFallback: true,
      requireCredentialAtLaunch: true,
    },
  };
  const errors = validateRuntimeConfig(invalid);
  assert.ok(errors.some((error) => error.includes("1.18.21")));
  assert.ok(errors.some((error) => error.includes("4.19.4")));
});
