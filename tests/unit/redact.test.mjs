import test from "node:test";
import assert from "node:assert/strict";
import { redact } from "../../scripts/validation/lib/redact.mjs";

test("UT-REDACT-001: GitHub トークン形式がマスキングされる", () => {
  const out = redact("token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh");
  assert.ok(!out.includes("ghp_"), "トークンが残っている");
  assert.ok(out.includes("[REDACTED]"));
});

test("UT-REDACT-002: api_key= 形式がマスキングされる", () => {
  const out = redact("api_key=sk-1234567890abcdef");
  assert.ok(!out.includes("sk-1234567890abcdef"));
  assert.ok(out.includes("[REDACTED]"));
});

test("UT-REDACT-003: 秘密鍵ブロックがマスキングされる", () => {
  const out = redact("-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----");
  assert.ok(!out.includes("MIIE"));
  assert.ok(out.includes("[REDACTED]"));
});

test("UT-REDACT-004: 通常テキストは変更されない", () => {
  const input = "正常なログメッセージです。";
  assert.equal(redact(input), input);
});
