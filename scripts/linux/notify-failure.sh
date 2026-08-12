#!/usr/bin/env bash
# AI Coding Startup Tools 障害通知 (systemd OnFailure から呼び出す)
# 設定例: /etc/ai-coding-startup-tools/alert.env に AI_ALERT_WEBHOOK_URL=... を記載
set -Eeuo pipefail

ENV_FILE="${AI_ALERT_ENV_FILE:-/etc/ai-coding-startup-tools/alert.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

WEBHOOK_URL="${AI_ALERT_WEBHOOK_URL:-}"
SERVICE_NAME="${1:-unknown}"

# 未設定・curl 不在の場合は何もしない (通知は任意機能)
if [[ -z "$WEBHOOK_URL" ]] || ! command -v curl >/dev/null 2>&1; then
  exit 0
fi

HOST_NAME="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOGS="$(journalctl -u "$SERVICE_NAME" -n 50 --no-pager 2>/dev/null | tail -n 20 || true)"

escape_json() {
  printf '%s' "$1" | sed ':a;N;$!ba;s/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\n/\\n/g'
}

PAYLOAD="{\"service\":\"$(escape_json "$SERVICE_NAME")\",\"host\":\"$(escape_json "$HOST_NAME")\",\"timestamp\":\"$TIMESTAMP\",\"level\":\"error\",\"message\":\"service failure\",\"logs\":\"$(escape_json "$LOGS")\"}"

# 通知失敗はスクリプト自体の成否に影響させない (curl エラーは無視)
curl -fsS -m 10 -H 'Content-Type: application/json' -d "$PAYLOAD" "$WEBHOOK_URL" >/dev/null 2>&1 || true
exit 0
