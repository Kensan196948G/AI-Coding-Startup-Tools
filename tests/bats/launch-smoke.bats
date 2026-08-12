#!/usr/bin/env bats

# E2E スモークテスト: 実 CLI が無い CI 環境でも起動スクリプトの分岐を
# スタブ CLI で実行し、回帰 (v0.3.0 の起動不能問題) を検知できるようにする。

setup() {
  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  if ! command -v claude >/dev/null 2>&1 || ! command -v codex >/dev/null 2>&1; then
    mkdir -p "$STUB_DIR"
    printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB_DIR/claude"
    printf '#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo "stub-codex 0.1"; else exit 0; fi\n' > "$STUB_DIR/codex"
    chmod +x "$STUB_DIR/claude" "$STUB_DIR/codex"
    export PATH="$STUB_DIR:$PATH"
  fi
  PROJECT_DIR="$BATS_TEST_TMPDIR/project"
  mkdir -p "$PROJECT_DIR"
}

@test "E2E-LAUNCH-001: claude launch --check が起動前検査に合格する (スタブ CLI)" {
  run bash claude-code/linux/launch.sh --check --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"起動前検査に合格"* ]]
}

@test "E2E-LAUNCH-002: codex launch --check が起動前検査に合格する (スタブ CLI)" {
  run bash codex/linux/launch.sh --check --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"起動前検査に合格"* ]]
}

@test "E2E-LAUNCH-003: 存在しないプロファイルは終了コード 2 で停止する" {
  run bash claude-code/linux/launch.sh --check --profile missing --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 2 ]
  [[ "$output" == *"プロファイルが見つかりません"* ]]

  run bash codex/linux/launch.sh --check --profile missing --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 2 ]
  [[ "$output" == *"プロファイルが見つかりません"* ]]
}

@test "E2E-LAUNCH-004: safe プロファイルの既定プロンプトが解決される" {
  run bash claude-code/linux/launch.sh --check --profile safe --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"プロンプト:"* ]]

  run bash codex/linux/launch.sh --check --profile safe --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"プロンプト:"* ]]
}

@test "E2E-INSTALL-001: install-check が CLI 導入済みとして成功する (スタブ CLI)" {
  run bash claude-code/linux/install-check.sh
  [ "$status" -eq 0 ]
  run bash codex/linux/install-check.sh
  [ "$status" -eq 0 ]
}
