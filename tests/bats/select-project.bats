#!/usr/bin/env bats

setup() {
  PROJECT_ROOT="$BATS_TEST_TMPDIR/projects"
  mkdir -p "$PROJECT_ROOT/good/.git" "$PROJECT_ROOT/good/.ai-startup-tools" "$PROJECT_ROOT/onlygit/.git"
}

@test "select-project --list は判定基準Cでプロジェクトを列挙する" {
  run bash scripts/linux/select-project.sh --projects-root "$PROJECT_ROOT" --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"good"* ]]
  [[ "$output" != *"onlygit"* ]]
}

@test "select-project は明示した存在しないルートで終了コード2" {
  run bash scripts/linux/select-project.sh --projects-root "$BATS_TEST_TMPDIR/nonexistent" --list
  [ "$status" -eq 2 ]
}
