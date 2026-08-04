#!/usr/bin/env bats

@test "共通ライブラリのバージョンが package.json と一致する" {
  PKG_VER="$(node -p "require('./package.json').version")"
  run bash -c 'source scripts/linux/lib/common.sh; printf "%s" "$TOOLKIT_VERSION"'
  [ "$status" -eq 0 ]
  [ "$output" = "$PKG_VER" ]
}

@test "bootstrap --version が package.json と一致する" {
  PKG_VER="$(node -p "require('./package.json').version")"
  run bash scripts/linux/bootstrap.sh --version
  [ "$status" -eq 0 ]
  [ "$output" = "$PKG_VER" ]
}

@test "claude launch --help が成功する" {
  run bash claude-code/linux/launch.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"安全起動"* ]]
}

@test "codex launch --help が成功する" {
  run bash codex/linux/launch.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"安全起動"* ]]
}

@test "install-check --help が成功する" {
  run bash claude-code/linux/install-check.sh --help
  [ "$status" -eq 0 ]
  run bash codex/linux/install-check.sh --help
  [ "$status" -eq 0 ]
}
