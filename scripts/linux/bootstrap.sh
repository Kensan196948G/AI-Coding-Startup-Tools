#!/usr/bin/env bash
set -euo pipefail
APPLY=0
YES=0
while (($#)); do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run|--non-interactive) shift ;;
    --yes) YES=1; shift ;;
    -h|--help) printf '%s\n' 'Usage: bootstrap.sh [--dry-run] [--apply --yes]'; exit 0 ;;
    *) printf '[ERROR] 不明な引数: %s\n' "$1" >&2; exit 2 ;;
  esac
done
PACKAGES=("opencode-ai@1.18.21" "oh-my-opencode@4.19.4")
if ((APPLY == 0)); then
  printf '[DRY-RUN] npm install --global %s\n' "${PACKAGES[*]}"
  printf '[DRY-RUN] OS側で /srv/deepseek-workspaces と /mnt/deepseek-smb を管理者が準備してください\n'
  exit 0
fi
((YES == 1)) || { printf '[ERROR] --applyには--yesが必要です\n' >&2; exit 2; }
command -v npm >/dev/null 2>&1 || { printf '[ERROR] npmが必要です\n' >&2; exit 2; }
npm install --global --save-exact "${PACKAGES[@]}"
printf '[OK] exact runtime packagesを導入しました\n'
