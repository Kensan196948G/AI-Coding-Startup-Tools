#!/usr/bin/env bats

setup() {
  PROJECT_DIR="$BATS_TEST_TMPDIR/project"
  mkdir -p "$PROJECT_DIR"
}

@test "UT-PATH-SHELL-001: シンボリックリンク経由のルート外出力を拒否する" {
  OUTSIDE="$BATS_TEST_TMPDIR/outside"
  mkdir -p "$OUTSIDE"
  ln -s "$OUTSIDE" "$PROJECT_DIR/link"
  run bash -c 'source scripts/linux/lib/common.sh; resolve_safe_output "$1" "link/evil.txt"' _ "$PROJECT_DIR"
  [ "$status" -eq 5 ]
  [[ "$output" == *"ルート外"* ]]
}

@test "UT-PATH-SHELL-002: 通常の相対パスは解決される" {
  run bash -c 'source scripts/linux/lib/common.sh; resolve_safe_output "$1" "docs/report.md"' _ "$PROJECT_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == "$PROJECT_DIR/docs/report.md" ]]
}

@test "SEC-SSH-001: check-windows-ssh はシェルメタ文字を含むプロジェクトルートを拒否する" {
  run bash scripts/linux/check-windows-ssh.sh \
    --host 192.168.0.1 --projects-root 'C:\projects" ; calc'
  [ "$status" -eq 5 ]
}

@test "SEC-SSH-002: check-windows-ssh は空白を含むホストを拒否する" {
  run bash scripts/linux/check-windows-ssh.sh \
    --host 'a b' --projects-root 'C:\projects'
  [ "$status" -eq 5 ]
}
