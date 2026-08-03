#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
環境診断 (Linux)

使い方:
  ./scripts/linux/diagnose.sh [オプション]

オプション:
  --json   機械可読出力 (JSON)
  --help   このヘルプを表示

終了コード:
  0  必須要件を満たす
  3  依存関係不足・非互換
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

declare -a ROWS=()

emit() {
  local name="$1" status="$2" detail="$3"
  ROWS+=("$name|$status|$detail")
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    return 0
  fi
  printf '[%s] %-16s %s\n' "$status" "$name" "$detail"
}

status=0

# OS / アーキテクチャ
OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"
emit os OK "$OS_NAME / $ARCH"

# Shell
if command -v bash >/dev/null 2>&1; then
  BASH_VER="$(bash --version | head -n 1 | grep -oE '[0-9]+\.[0-9]+' | head -n 1)"
  if [[ "$(printf '%s\n5.1\n' "$BASH_VER" | sort -V | head -n 1)" == "5.1" ]]; then
    emit bash OK "bash $BASH_VER"
  else
    emit bash NG "bash $BASH_VER は非対応です (5.1 以上が必要)"
    status=1
  fi
else
  emit bash NG "bash が見つかりません。"
  status=1
fi

# Git
if command -v git >/dev/null 2>&1; then
  GIT_VER="$(git --version | awk '{print $3}')"
  if [[ "$(printf '%s\n2.43\n' "$GIT_VER" | sort -V | head -n 1)" == "2.43" ]]; then
    emit git OK "git $GIT_VER"
  else
    emit git NG "git $GIT_VER は非対応です (2.43 以上が必要)"
    status=1
  fi
else
  emit git NG "git が見つかりません。導入してください。"
  status=1
fi

# Node.js
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version | tr -d 'v')"
  MAJOR="${NODE_VER%%.*}"
  if [[ "$MAJOR" -ge 20 ]]; then
    emit node OK "node $NODE_VER"
  else
    emit node NG "node $NODE_VER は非対応です (20 以上が必要)"
    status=1
  fi
else
  emit node NG "node が見つかりません。導入してください。"
  status=1
fi

# Claude Code
if command -v claude >/dev/null 2>&1; then
  emit claude OK "$(claude --version 2>/dev/null | head -n 1 || echo 'unknown')"
else
  emit claude WARN "未導入です。公式ドキュメント https://docs.anthropic.com/en/docs/claude-code/setup を参照してください。"
fi

# Codex
if command -v codex >/dev/null 2>&1; then
  emit codex OK "$(codex --version 2>/dev/null | head -n 1 || echo 'unknown')"
else
  emit codex WARN "未導入です。公式ドキュメント https://developers.openai.com/codex/ を参照してください。"
fi

if [[ "$JSON_OUTPUT" -eq 1 ]]; then
  printf '{"os":"%s","arch":"%s","items":[' "$OS_NAME" "$ARCH"
  for i in "${!ROWS[@]}"; do
    [[ "$i" -gt 0 ]] && printf ','
    IFS='|' read -r n s d <<< "${ROWS[$i]}"
    printf '{"name":"%s","status":"%s","detail":"%s"}' "$n" "$s" "$d"
  done
  printf ']}\n'
fi

if [[ "$status" -eq 1 ]]; then
  log_error "必須要件を満たしていません。上記の NG 項目を解消してください。"
  exit "$EXIT_DEPENDENCY"
fi

exit "$EXIT_SUCCESS"
