#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../scripts/linux/lib/common.sh
source "$SCRIPT_DIR/../../scripts/linux/lib/common.sh"

usage() {
  cat <<'EOF'
Claude Code 導入確認 (Linux)

使い方:
  ./claude-code/linux/install-check.sh [--json]

オプション:
  --json   機械可読出力 (JSON)
  --help   このヘルプを表示

終了コード:
  0  導入済み
  3  未導入または互換性不足
EOF
}

JSON_OUTPUT=0
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=1 ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $arg (--help を参照)" ;;
  esac
done

report() {
  local name="$1" status="$2" detail="$3"
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    printf '{"name":"%s","status":"%s","detail":"%s"}\n' "$name" "$status" "$detail"
  else
    printf '[%s] %s: %s\n' "$status" "$name" "$detail"
  fi
}

status=0

if command -v claude >/dev/null 2>&1; then
  CL_VERSION="$(claude --version 2>/dev/null || echo 'unknown')"
  report claude OK "claude $CL_VERSION"
else
  report claude NG "未導入です。公式ドキュメント https://docs.anthropic.com/en/docs/claude-code/setup を参照して導入してください。"
  status=1
fi

if command -v node >/dev/null 2>&1; then
  report node OK "node $(node --version 2>/dev/null)"
else
  report node WARN "node が見つかりません。Claude Code の実行に必要な場合があります。"
fi

if command -v git >/dev/null 2>&1; then
  report git OK "git $(git --version | awk '{print $3}')"
else
  report git NG "git が見つかりません。導入してください。"
  status=1
fi

exit "$status"
