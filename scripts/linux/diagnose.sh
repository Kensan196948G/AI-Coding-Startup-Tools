#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TOOL_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
status=0
check_command() { if command -v "$1" >/dev/null 2>&1; then printf '[OK] %s: %s\n' "$1" "$($1 --version 2>/dev/null | head -n 1)"; else printf '[ERROR] %s: 未導入\n' "$1"; status=1; fi; }
check_command git
check_command node
if command -v bwrap >/dev/null 2>&1; then printf '[OK] bubblewrap: %s\n' "$(bwrap --version 2>/dev/null)"; else printf '[ERROR] bubblewrap: 未導入\n'; status=1; fi
if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then printf '[OK] DEEPSEEK_API_KEY: configured (masked)\n'; else printf '[WARN] DEEPSEEK_API_KEY: 未設定\n'; fi
OPENCODE_BIN="$TOOL_ROOT/node_modules/.bin/opencode"
if [[ ! -x "$OPENCODE_BIN" ]]; then OPENCODE_BIN="$(command -v opencode || true)"; fi
[[ -n "$OPENCODE_BIN" && "$("$OPENCODE_BIN" --version 2>/dev/null || true)" == "1.18.21" ]] || { printf '[ERROR] opencode-ai@1.18.21が必要です\n'; status=1; }
exit "$status"
