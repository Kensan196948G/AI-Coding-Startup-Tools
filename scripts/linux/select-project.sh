#!/usr/bin/env bash
set -euo pipefail
ROOT="${DEEPSEEK_LOCAL_ROOTS:-/srv/deepseek-workspaces}"
PROFILE="safe"
while (($#)); do case "$1" in --root) ROOT="${2:-}"; shift 2;; --profile) PROFILE="${2:-}"; shift 2;; -h|--help) printf '%s\n' 'Usage: select-project.sh [--root path] [--profile name]'; exit 0;; *) exit 2;; esac; done
[[ -d "$ROOT" ]] || { printf '[ERROR] Storage Rootがありません: %s\n' "$ROOT" >&2; exit 2; }
mapfile -t projects < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -print | sort)
((${#projects[@]})) || { printf '[ERROR] Projectがありません\n' >&2; exit 2; }
select project in "${projects[@]}"; do [[ -n "$project" ]] && break; done
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec "$SCRIPT_DIR/launch.sh" --workspace "$project" --profile "$PROFILE"
