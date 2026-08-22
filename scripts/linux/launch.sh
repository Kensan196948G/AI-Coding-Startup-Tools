#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TOOL_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
WORKSPACE=""
PROFILE="safe"
CHECK_ONLY=0

usage() {
  printf '%s\n' 'Usage: launch.sh --workspace <absolute-path> [--profile safe|development|autonomous|deep-debug] [--check]'
}

while (($#)); do
  case "$1" in
    --workspace) WORKSPACE="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf '[ERROR] 不明な引数: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$WORKSPACE" ]] || { printf '[ERROR] --workspaceが必要です\n' >&2; exit 2; }
case "$PROFILE" in safe|development|autonomous|deep-debug) ;; *) printf '[ERROR] 不明なprofileです\n' >&2; exit 2 ;; esac

command -v node >/dev/null 2>&1 || { printf '[ERROR] nodeが必要です\n' >&2; exit 2; }
command -v bwrap >/dev/null 2>&1 || { printf '[ERROR] bubblewrapが必要です\n' >&2; exit 2; }

OPENCODE_BIN="$TOOL_ROOT/node_modules/.bin/opencode"
if [[ ! -x "$OPENCODE_BIN" ]]; then
  OPENCODE_BIN="$(command -v opencode || true)"
fi
[[ -n "$OPENCODE_BIN" ]] || { printf '[ERROR] opencode-ai@1.18.21が必要です\n' >&2; exit 2; }

ACTUAL_VERSION="$("$OPENCODE_BIN" --version 2>/dev/null | head -n 1)"
[[ "$ACTUAL_VERSION" == "1.18.21" ]] || { printf '[ERROR] OpenCode version mismatch: expected 1.18.21, actual %s\n' "$ACTUAL_VERSION" >&2; exit 2; }
node "$TOOL_ROOT/scripts/validation/validate-deepseek-runtime.mjs" >/dev/null

IFS=',' read -r -a LOCAL_ROOTS <<< "${DEEPSEEK_LOCAL_ROOTS:-/srv/deepseek-workspaces}"
IFS=',' read -r -a SMB_ROOTS <<< "${DEEPSEEK_SMB_ROOTS:-/mnt/deepseek-smb}"
VALIDATE=(node "$TOOL_ROOT/scripts/validation/validate-workspace.mjs" --workspace "$WORKSPACE")
STORAGE="local"
for root in "${SMB_ROOTS[@]}"; do [[ "$WORKSPACE" == "$root"/* ]] && STORAGE="smb"; done
VALIDATE+=(--storage "$STORAGE")
for root in "${LOCAL_ROOTS[@]}"; do VALIDATE+=(--local-root "$root"); done
for root in "${SMB_ROOTS[@]}"; do VALIDATE+=(--smb-root "$root"); done
CANONICAL_WORKSPACE="$("${VALIDATE[@]}")"

printf '[OK] Workspace: %s\n' "$CANONICAL_WORKSPACE"
printf '[OK] Profile: %s\n' "$PROFILE"
printf '[OK] Provider: deepseek only\n'
printf '[OK] OpenCode: %s\n' "$ACTUAL_VERSION"
if ((CHECK_ONLY)); then exit 0; fi
[[ -n "${DEEPSEEK_API_KEY:-}" ]] || { printf '[ERROR] DEEPSEEK_API_KEYが設定されていません\n' >&2; exit 2; }

OPENCODE_REAL="$(readlink -f "$OPENCODE_BIN")"
RUNTIME_ROOT="$(cd -- "$(dirname -- "$OPENCODE_REAL")/.." && pwd -P)"
AUTO_ARGS=()
[[ "$PROFILE" == "autonomous" || "$PROFILE" == "development" || "$PROFILE" == "deep-debug" ]] && AUTO_ARGS+=(--auto)
exec node "$TOOL_ROOT/sandbox/linux/launch-opencode.mjs" \
  --workspace "$CANONICAL_WORKSPACE" \
  --profile-config "$TOOL_ROOT/opencode/profiles/$PROFILE.json" \
  --tool-root "$TOOL_ROOT" \
  --opencode "$OPENCODE_REAL" \
  --runtime-root "$RUNTIME_ROOT" \
  "${AUTO_ARGS[@]}"
