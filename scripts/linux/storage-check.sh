#!/usr/bin/env bash
set -euo pipefail
for root in "${DEEPSEEK_LOCAL_ROOTS:-/srv/deepseek-workspaces}" "${DEEPSEEK_SMB_ROOTS:-/mnt/deepseek-smb}"; do
  if [[ -d "$root" ]]; then printf '[OK] %s\n' "$(realpath "$root")"; else printf '[WARN] 未配置: %s\n' "$root"; fi
done
