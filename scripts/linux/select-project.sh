#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/linux/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
プロジェクト選択メニュー (Linux / Bash)

使い方:
  ./scripts/linux/select-project.sh [オプション]

オプション:
  --projects-root <dir>  プロジェクトルート (既定: $AI_STARTUP_TOOLS_PROJECTS_ROOT または ~/projects)
  --action <name>        選択後のアクション: bootstrap | launch-claude | launch-codex
                         (省略時は選択したプロジェクトのパスを表示)
  --list                 一覧を表示して終了 (非対話)
  --help                 このヘルプを表示

判定基準: .git と .ai-startup-tools/ の両方を持つフォルダ
EOF
}

PROJECTS_ROOT="${AI_STARTUP_TOOLS_PROJECTS_ROOT:-}"
ROOT_EXPLICIT=0
ACTION=""
LIST_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --projects-root) PROJECTS_ROOT="$2"; ROOT_EXPLICIT=1; shift 2 ;;
    --action) ACTION="$2"; shift 2 ;;
    --list) LIST_ONLY=1; shift ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $1 (--help を参照)" ;;
  esac
done

case "$ACTION" in
  ""|bootstrap|launch-claude|launch-codex) ;;
  *) die "$EXIT_ARGUMENT" "--action は bootstrap / launch-claude / launch-codex のいずれかを指定してください" ;;
esac

if [[ -z "$PROJECTS_ROOT" ]]; then
  PROJECTS_ROOT="$HOME/projects"
fi

if [[ ! -d "$PROJECTS_ROOT" ]]; then
  if [[ "$ROOT_EXPLICIT" -eq 1 ]]; then
    die "$EXIT_ARGUMENT" "プロジェクトルートが見つかりません: $PROJECTS_ROOT"
  fi
  log_warn "プロジェクトルートがありません (既定値): $PROJECTS_ROOT"
  exit "$EXIT_SUCCESS"
fi

PROJECTS_ROOT="$(resolve_project_dir "$PROJECTS_ROOT")" || exit $?

declare -a NAMES=() PATHS=()
for d in "$PROJECTS_ROOT"/*/; do
  [[ -d "$d" ]] || continue
  if [[ -d "$d/.git" && -d "$d/.ai-startup-tools" ]]; then
    NAMES+=("$(basename "$d")")
    PATHS+=("${d%/}")
  fi
done

if [[ ${#NAMES[@]} -eq 0 ]]; then
  log_warn "対象プロジェクトがありません (.git と .ai-startup-tools/ の両方が必要)"
  exit "$EXIT_SUCCESS"
fi

if [[ "$LIST_ONLY" -eq 1 ]]; then
  for i in "${!NAMES[@]}"; do
    printf '%s\t%s\n' "${NAMES[$i]}" "${PATHS[$i]}"
  done
  exit "$EXIT_SUCCESS"
fi

log_info "プロジェクトルート: $PROJECTS_ROOT"
for i in "${!NAMES[@]}"; do
  printf '[%d] %s\n' "$((i+1))" "${NAMES[$i]}"
  printf '    %s\n' "${PATHS[$i]}"
done

printf '番号を選択してください (1-%d, q=終了): ' "${#NAMES[@]}"
read -r sel
if [[ "$sel" == "q" || "$sel" == "Q" ]]; then
  die "$EXIT_CANCELLED" "キャンセルしました。"
fi
if ! [[ "$sel" =~ ^[0-9]+$ ]] || [[ "$sel" -lt 1 || "$sel" -gt "${#NAMES[@]}" ]]; then
  die "$EXIT_ARGUMENT" "選択が不正です: $sel"
fi

IDX=$((sel-1))
SELECTED="${PATHS[$IDX]}"
log_info "選択: ${NAMES[$IDX]} ($SELECTED)"

case "$ACTION" in
  "")
    printf '%s\n' "$SELECTED"
    ;;
  bootstrap)
    bash "$SCRIPT_DIR/bootstrap.sh" --project-dir "$SELECTED" --dry-run
    ;;
  launch-claude)
    bash "$SCRIPT_DIR/../../claude-code/linux/launch.sh" --project-dir "$SELECTED"
    ;;
  launch-codex)
    bash "$SCRIPT_DIR/../../codex/linux/launch.sh" --project-dir "$SELECTED"
    ;;
esac
exit "$EXIT_SUCCESS"
