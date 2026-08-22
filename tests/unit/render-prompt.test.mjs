import test from "node:test";
import assert from "node:assert/strict";
import { parsePrompt, renderPrompt } from "../../scripts/validation/lib/render-prompt.mjs";

const PROMPT = `---
schemaVersion: 1
id: sample
title: サンプル
targets: [opencode]
phase: implementation
variables: [PROJECT_NAME, COMPLETION_CRITERIA]
approvalGates: [merge_main]
updatedAt: 2026-08-04
---

# 目的

{{PROJECT_NAME}} を実装してください。

# 完了条件

{{COMPLETION_CRITERIA}}
`;

test("IT-PROMPT-001: 未解決変数がある場合はエラーになる", () => {
  assert.throws(() => renderPrompt(PROMPT, { PROJECT_NAME: "Demo" }), /未解決の変数/);
});

test("IT-PROMPT-002: 全変数を指定すると安全に置換される", () => {
  const { body } = renderPrompt(PROMPT, {
    PROJECT_NAME: "Demo",
    COMPLETION_CRITERIA: "テストが成功すること",
  });
  assert.ok(body.includes("Demo を実装してください"));
  assert.ok(body.includes("テストが成功すること"));
  assert.ok(!body.includes("{{"));
});

test("IT-PROMPT-003: 未宣言の変数はエラーになる", () => {
  const bad = PROMPT.replace("{{COMPLETION_CRITERIA}}", "{{UNDECLARED_VAR}}");
  assert.throws(() => renderPrompt(bad, { PROJECT_NAME: "Demo", UNDECLARED_VAR: "x" }), /未宣言の変数/);
});

test("IT-PROMPT-004: Front Matter が解析できる", () => {
  const { meta } = parsePrompt(PROMPT);
  assert.equal(meta.id, "sample");
  assert.deepEqual(meta.targets, ["opencode"]);
});
