#!/usr/bin/env bats

setup() {
  export TEST_ROOT="$BATS_TEST_TMPDIR/storage"
  export TEST_WORKSPACE="$TEST_ROOT/project-a"
  export TEST_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$TEST_WORKSPACE/.git" "$TEST_BIN"
  printf '#!/usr/bin/env bash\n[[ "${1:-}" == "--version" ]] && echo 1.18.21\n' > "$TEST_BIN/opencode"
  chmod +x "$TEST_BIN/opencode"
  export PATH="$TEST_BIN:$PATH"
  export DEEPSEEK_LOCAL_ROOTS="$TEST_ROOT"
  export DEEPSEEK_SMB_ROOTS="$BATS_TEST_TMPDIR/missing-smb"
}

@test "bootstrapは既定でdry-run" {
  run bash scripts/linux/bootstrap.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"opencode-ai@1.18.21"* ]]
}

@test "launch checkは検証済みWorkspaceとDeepSeek-onlyを受理" {
  run bash scripts/linux/launch.sh --workspace "$TEST_WORKSPACE" --profile safe --check
  [ "$status" -eq 0 ]
  [[ "$output" == *"Provider: deepseek only"* ]]
}

@test "launch checkはRoot外Workspaceを拒否" {
  run bash scripts/linux/launch.sh --workspace "$BATS_TEST_TMPDIR" --profile safe --check
  [ "$status" -ne 0 ]
}

@test "launchは未知profileを拒否" {
  run bash scripts/linux/launch.sh --workspace "$TEST_WORKSPACE" --profile unsafe --check
  [ "$status" -ne 0 ]
}
