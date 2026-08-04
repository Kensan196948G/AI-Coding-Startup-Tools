#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/linux/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Windows への SSH 接続確認 (Linux → Windows)

使い方:
  ./scripts/linux/check-windows-ssh.sh --host <ip> [--user <name>] [--projects-root <path>]

オプション:
  --host <ip>           Windows の IP アドレス (または環境変数 AI_WEBUI_WINDOWS_HOST)
  --user <name>         接続ユーザー (または環境変数 AI_WEBUI_WINDOWS_USER)
  --projects-root <p>   Windows 側のプロジェクトルート単体 (または AI_WEBUI_WINDOWS_PROJECTS_ROOT)
                         ※ 本スクリプトは単一ルートのみ対応。WebUI 側はカンマ区切りで
                           複数ルートを指定できるが、その値をそのまま渡すと失敗するため、
                           複数ルートがある場合はルートごとに実行すること。
  --help                このヘルプを表示

終了コード:
  0  接続成功・プロジェクト一覧を表示
  2  引数不正
  7  SSH 接続失敗・リモート実行失敗
EOF
}

HOST="${AI_WEBUI_WINDOWS_HOST:-}"
USER="${AI_WEBUI_WINDOWS_USER:-}"
PROJECTS_ROOT="${AI_WEBUI_WINDOWS_PROJECTS_ROOT:-C:\\projects}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --projects-root) PROJECTS_ROOT="$2"; shift 2 ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $1 (--help を参照)" ;;
  esac
done

[[ -n "$HOST" ]] || die "$EXIT_ARGUMENT" "--host (または AI_WEBUI_WINDOWS_HOST) を指定してください。"
if [[ ! "$HOST" =~ ^[A-Za-z0-9.:_-]+$ ]]; then
  die "$EXIT_SECURITY" "ホスト名に使用できない文字が含まれています: $HOST"
fi
if [[ -n "$USER" && ! "$USER" =~ ^[A-Za-z0-9._@\\-]+$ ]]; then
  die "$EXIT_SECURITY" "接続ユーザー名に使用できない文字が含まれています。"
fi
require_command ssh

# Windows プロジェクトルートは SSH 経由の PowerShell コマンド文字列へ埋め込むため、
# ドライブレター + バックスラッシュ区切りの英数字・空白・.-_ のみ許可する。
WINDOWS_ROOT_RE='^[A-Za-z]:\\[A-Za-z0-9 ._-]+(\\[A-Za-z0-9 ._-]+)*$'
if [[ ! "$PROJECTS_ROOT" =~ $WINDOWS_ROOT_RE ]]; then
  die "$EXIT_SECURITY" "プロジェクトルートに使用できない文字が含まれています: $PROJECTS_ROOT"
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)
TARGET="$HOST"
[[ -n "$USER" ]] && TARGET="${USER}@${HOST}"

log_info "接続確認: $TARGET"
if ! ssh "${SSH_OPTS[@]}" "$TARGET" "echo AI_STARTUP_TOOLS_SSH_OK"; then
  die "$EXIT_EXTERNAL" "SSH 接続に失敗しました。Windows 側の OpenSSH Server 設定を確認してください (docs/guides/windows-ssh-server.md)。"
fi

PROJECTS_ROOT_QUOTED="${PROJECTS_ROOT//\'/\'\'}"
CMD="powershell -NoProfile -NonInteractive -Command \"Get-ChildItem -LiteralPath '${PROJECTS_ROOT_QUOTED}' -Directory | Where-Object { (Test-Path -LiteralPath (Join-Path \$_.FullName '.git')) -and (Test-Path -LiteralPath (Join-Path \$_.FullName '.ai-startup-tools')) } | ForEach-Object { \$_.FullName }\""

log_info "Windows プロジェクトルート: $PROJECTS_ROOT"
# SC2029: $CMD はリモートへ渡す完成済みコマンド文字列のため、クライアント側での展開は意図どおり
# shellcheck disable=SC2029
if ! OUT="$(ssh "${SSH_OPTS[@]}" "$TARGET" "$CMD")"; then
  die "$EXIT_EXTERNAL" "リモート実行に失敗しました。プロジェクトルートのパスを確認してください。"
fi

if [[ -z "$OUT" ]]; then
  log_warn "対象プロジェクトがありません (.git と .ai-startup-tools/ の両方が必要)"
else
  printf '%s\n' "$OUT"
fi
exit "$EXIT_SUCCESS"
