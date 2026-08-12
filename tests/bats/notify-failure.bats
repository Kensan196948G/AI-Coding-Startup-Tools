#!/usr/bin/env bats

setup() {
  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_DIR"
  cat > "$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "$*" > "${CURL_CAPTURE_FILE:-/tmp/curl-capture}"
exit 0
EOF
  chmod +x "$STUB_DIR/curl"
  export PATH="$STUB_DIR:$PATH"
  export AI_ALERT_ENV_FILE="$BATS_TEST_TMPDIR/alert.env"
  export CURL_CAPTURE_FILE="$BATS_TEST_TMPDIR/captured.txt"
}

@test "OPS-NOTIFY-001: Webhook 未設定なら何も送信せず成功する" {
  run bash scripts/linux/notify-failure.sh ai-coding-startup-tools-webui.service
  [ "$status" -eq 0 ]
  [ ! -e "$CURL_CAPTURE_FILE" ]
}

@test "OPS-NOTIFY-002: Webhook 設定時は JSON ペイロードを送信する" {
  printf 'AI_ALERT_WEBHOOK_URL=https://example.test/hook\n' > "$AI_ALERT_ENV_FILE"
  run bash scripts/linux/notify-failure.sh ai-coding-startup-tools-webui.service
  [ "$status" -eq 0 ]
  [ -e "$CURL_CAPTURE_FILE" ]
  [[ "$(cat "$CURL_CAPTURE_FILE")" == *"ai-coding-startup-tools-webui.service"* ]]
  [[ "$(cat "$CURL_CAPTURE_FILE")" == *"https://example.test/hook"* ]]
}
