#!/usr/bin/env bats

@test "UT-PROMPT-SHELL-001: 未指定変数があると終了コード 2 で停止する" {
  run bash -c 'source scripts/linux/lib/common.sh; check_prompt_variables prompts/common/implementation-safe.md'
  [ "$status" -eq 2 ]
  [[ "$output" == *"未解決"* ]]
}

@test "UT-PROMPT-SHELL-002: 空の --set 配列展開でも全変数を指定すれば成功する" {
  run bash -c 'source scripts/linux/lib/common.sh; declare -a SET_VARS=(); check_prompt_variables prompts/common/implementation-safe.md "${SET_VARS[@]+"${SET_VARS[@]}"}" PROJECT_NAME=x COMPLETION_CRITERIA=y'
  [ "$status" -eq 0 ]
}

@test "E2E-CLAUDE-LINUX-001: launch --check が起動前検査に合格する" {
  if ! command -v claude >/dev/null 2>&1; then
    skip "claude CLI が未導入のため"
  fi
  run bash claude-code/linux/launch.sh --check --project-dir "$BATS_TEST_TMPDIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"起動前検査に合格"* ]]
}

@test "E2E-CODEX-LINUX-001: codex launch --check が起動前検査に合格する" {
  if ! command -v codex >/dev/null 2>&1; then
    skip "codex CLI が未導入のため"
  fi
  run bash codex/linux/launch.sh --check --project-dir "$BATS_TEST_TMPDIR" \
    --set PROJECT_NAME=demo --set COMPLETION_CRITERIA=demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"起動前検査に合格"* ]]
}
