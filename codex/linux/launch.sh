#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/linux/lib/common.sh
source "$SCRIPT_DIR/../../scripts/linux/lib/common.sh"

usage() {
  cat <<'EOF'
Codex 安全起動 (Linux)

使い方:
  ./codex/linux/launch.sh [オプション]

オプション:
  --project-dir <path>   対象プロジェクト (既定: 現在のディレクトリ)
  --profile <id>         利用プロファイル (既定: safe)
  --set VAR=value        プロンプト変数の指定 (複数指定可)
  --check                起動前検査のみ実行して終了
  --dry-run              起動コマンドを表示して実行しない
  --yes                  確認を省略 (高リスク操作は対象外)
  --non-interactive      非対話モード (CI 等)
  --allow-dangerous      全権限オプションを有効化 (明示的な場合のみ)
  --verbose              詳細ログ
  --json                 機械可読出力
  --version              バージョン表示
  --help                 このヘルプを表示

終了コード: 0 成功 / 2 引数不正 / 3 依存不足 / 4 承認待ち / 5 安全違反 / 6 ファイル競合
EOF
}

PROJECT_DIR="$(pwd)"
PROFILE="safe"
CHECK_ONLY=0
DRY_RUN=0
YES=0
NON_INTERACTIVE=0
ALLOW_DANGEROUS=0
VERBOSE=0
JSON_OUTPUT=0
declare -a SET_VARS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --set) SET_VARS+=("$2"); shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes) YES=1; shift ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --allow-dangerous) ALLOW_DANGEROUS=1; shift ;;
    --verbose) VERBOSE=1; shift ;;
    --json) JSON_OUTPUT=1; shift ;;
    --version) echo "$TOOLKIT_VERSION"; exit "$EXIT_SUCCESS" ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $1 (--help を参照)" ;;
  esac
done

require_command codex

if [[ "$VERBOSE" -eq 1 ]]; then
  log_info "verbose モードで実行します (profile: $PROFILE)"
fi

PROJECT_DIR="$(resolve_project_dir "$PROJECT_DIR")" || exit $?

if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo '(detached)')"
  DIRTY="$(git -C "$PROJECT_DIR" status --porcelain | wc -l | tr -d ' ')"
  REMOTE="$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null || echo '(none)')"
  log_info "Git 状態: ブランチ=$BRANCH, dirty=$DIRTY, remote=$REMOTE"
else
  log_warn "Git リポジトリではありません (ディレクトリ: $PROJECT_DIR)"
fi

for f in AGENTS.md AGENTS.override.md CLAUDE.md; do
  if [[ -f "$PROJECT_DIR/$f" ]]; then
    log_info "指示ファイルあり: $f"
  fi
done

PROMPT_PATH=""
if [[ -f "$PROJECT_DIR/.ai-startup-tools/profile.yml" ]]; then
  PROMPT_PATH="$(grep -E '^\s*default:' "$PROJECT_DIR/.ai-startup-tools/profile.yml" 2>/dev/null | awk '{print $2}' | tr -d '"')"
fi
if [[ -z "$PROMPT_PATH" ]]; then
  PROMPT_PATH="prompts/common/implementation-safe.md"
fi
if [[ -f "$PROMPT_PATH" ]]; then
  log_info "プロンプト: $PROMPT_PATH"
  check_prompt_variables "$PROMPT_PATH" "${SET_VARS[@]+"${SET_VARS[@]}"}"
else
  log_warn "プロンプトが見つかりません: $PROMPT_PATH (変数検査をスキップ)"
fi

if [[ "$ALLOW_DANGEROUS" -eq 1 ]]; then
  log_warn "全権限オプション (--full-auto / --dangerously-bypass-approvals-and-sandbox) を有効化します。利用者はリスクを理解している必要があります。"
fi

declare -a CMD=(codex)
if [[ "$ALLOW_DANGEROUS" -eq 1 ]]; then
  CMD+=(--dangerously-bypass-approvals-and-sandbox)
fi
CMD+=("--cd" "$PROJECT_DIR")

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log_info "起動前検査に合格しました。"
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    printf '{"status":"ok","projectDir":"%s","command":"%s"}\n' "$PROJECT_DIR" "$(printf '%s ' "${CMD[@]}" | sed 's/ $//')"
  fi
  exit "$EXIT_SUCCESS"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log_info "実行予定コマンド: ${CMD[*]}"
  exit "$EXIT_SUCCESS"
fi

if [[ "$NON_INTERACTIVE" -eq 1 && "$YES" -ne 1 ]]; then
  die "$EXIT_CANCELLED" "非対話モードでは起動前に --yes が必要です。"
fi

if [[ "$YES" -ne 1 ]]; then
  log_info "Codex を起動しますか? (yes/no)"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "$EXIT_CANCELLED" "キャンセルしました。" ;;
  esac
fi

log_info "Codex を起動します: $PROJECT_DIR"
cd "$PROJECT_DIR" || die "$EXIT_GENERAL" "作業ディレクトリに移動できません: $PROJECT_DIR"
exec "${CMD[@]}"
