#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
AI Coding Startup Tools 初期化 (Linux)

使い方:
  ./scripts/linux/bootstrap.sh [オプション]

オプション:
  --project-dir <path>   対象プロジェクト (既定: 現在のディレクトリ)
  --tool <name>          対象ツール: claude-code | codex (既定: claude-code)
  --profile <id>         利用プロファイル (既定: safe)
  --dry-run              変更予定のみ表示 (既定)
  --apply                実際に変更を適用
  --yes                  確認を省略 (高リスク操作は対象外)
  --non-interactive      非対話モード (CI 等)
  --verbose              詳細ログ
  --json                 機械可読出力
  --version              バージョン表示
  --help                 このヘルプを表示

終了コード: 0 成功 / 2 引数不正 / 3 依存不足 / 4 承認待ち / 5 安全違反 / 10 部分成功
EOF
}

PROJECT_DIR="$(pwd)"
TOOL="claude-code"
PROFILE="safe"
DRY_RUN=1
YES=0
NON_INTERACTIVE=0
VERBOSE=0
JSON_OUTPUT=0
SCRIPT_NAME="bootstrap"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --tool) TOOL="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --apply) DRY_RUN=0; shift ;;
    --yes) YES=1; shift ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --verbose) VERBOSE=1; shift ;;
    --json) JSON_OUTPUT=1; shift ;;
    --version) echo "$TOOLKIT_VERSION"; exit "$EXIT_SUCCESS" ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $1 (--help を参照)" ;;
  esac
done

case "$TOOL" in
  claude-code) CONFIG_SRC="claude-code/common/config.example.yml" ;;
  codex)       CONFIG_SRC="codex/common/config.example.yml" ;;
  *) die "$EXIT_ARGUMENT" "--tool は claude-code または codex を指定してください。" ;;
esac

PROFILE_SRC="claude-code/common/profiles/$PROFILE.yml"
if [[ "$TOOL" == "codex" ]]; then
  PROFILE_SRC="codex/common/profiles/$PROFILE.yml"
fi

if [[ ! -f "$PROFILE_SRC" ]]; then
  die "$EXIT_ARGUMENT" "プロファイルが見つかりません: $PROFILE_SRC"
fi
if [[ ! -f "$CONFIG_SRC" ]]; then
  die "$EXIT_GENERAL" "設定の雛形が見つかりません: $CONFIG_SRC"
fi

PROJECT_DIR="$(resolve_project_dir "$PROJECT_DIR")" || exit "$EXIT_ARGUMENT"
TOOLKIT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

LOCAL_DIR="$PROJECT_DIR/.ai-startup-tools"
CONFIG_TARGET="$LOCAL_DIR/config.yml"
PROFILE_TARGET="$LOCAL_DIR/profile.yml"
GITIGNORE_TARGET="$LOCAL_DIR/.gitignore"
LOG_DIR="$LOCAL_DIR/logs"
OPERATION_ID="$(new_operation_id)"

log_info "対象ツール: $TOOL / プロファイル: $PROFILE"
log_info "ローカル設定先: $LOCAL_DIR"

# 変更計画
declare -a PLAN_TARGETS=("$CONFIG_TARGET" "$PROFILE_TARGET" "$GITIGNORE_TARGET")
for t in "${PLAN_TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    log_info "[計画] 更新(既存あり): $t"
  else
    log_info "[計画] 作成: $t"
  fi
done
log_info "[計画] 監査ログ: $LOG_DIR/audit.jsonl"

if [[ "$JSON_OUTPUT" -eq 1 ]]; then
  printf '{"operationId":"%s","mode":"%s","tool":"%s","projectDir":"%s","targets":[%s]}\n' \
    "$OPERATION_ID" "$([[ "$DRY_RUN" -eq 1 ]] && echo dry-run || echo apply)" "$TOOL" "$PROJECT_DIR" \
    "$(printf '"%s",' "${PLAN_TARGETS[@]}" | sed 's/,$//')"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log_info "dry-run のため変更は行いません。適用するには --apply を指定してください。"
  exit "$EXIT_SUCCESS"
fi

if [[ "$NON_INTERACTIVE" -eq 1 && "$YES" -ne 1 ]]; then
  die "$EXIT_CANCELLED" "非対話モードで適用するには --yes が必要です。"
fi

if [[ "$YES" -ne 1 ]]; then
  log_info "上記の変更を適用しますか? (yes/no)"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "$EXIT_CANCELLED" "キャンセルしました。" ;;
  esac
fi

# バックアップ
BACKUP_DIR="$LOCAL_DIR/backups/$OPERATION_ID"
partial=0
for t in "${PLAN_TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    backup_target "$t" "$BACKUP_DIR" || partial=1
  fi
done

# 適用 (原子的更新)
apply_ok=0
if [[ -e "$CONFIG_TARGET" ]]; then
  log_info "config.yml は既存のため保持します (バックアップ: $BACKUP_DIR)"
else
  atomic_write "$CONFIG_TARGET" "$TOOLKIT_ROOT/$CONFIG_SRC" && apply_ok=1
fi
if [[ -e "$PROFILE_TARGET" ]]; then
  log_info "profile.yml は既存のため保持します (バックアップ: $BACKUP_DIR)"
else
  atomic_write "$PROFILE_TARGET" "$TOOLKIT_ROOT/$PROFILE_SRC" && apply_ok=1
fi
mkdir -p "$LOCAL_DIR"
printf '*\n' > "$GITIGNORE_TARGET" || partial=1

append_audit_log "$LOG_DIR" "$OPERATION_ID" "bootstrap" "apply" "$LOCAL_DIR" || true

if [[ "$partial" -eq 1 ]]; then
  log_warn "一部の処理が失敗しました。バックアップ: $BACKUP_DIR"
  exit "$EXIT_PARTIAL"
fi

log_info "初期化が完了しました。復元用バックアップ: $BACKUP_DIR"
exit "$EXIT_SUCCESS"
