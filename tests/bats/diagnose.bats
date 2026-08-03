#!/usr/bin/env bats

setup() {
  PROJECT_DIR="$BATS_TEST_TMPDIR/project"
  mkdir -p "$PROJECT_DIR"
}

@test "diagnose --help が成功する" {
  run bash scripts/linux/diagnose.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"環境診断"* ]]
}

@test "IT-BOOT-001: bootstrap dry-run は書き込みなしで計画を表示する" {
  run bash scripts/linux/bootstrap.sh --project-dir "$PROJECT_DIR" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"dry-run"* ]]
  [ ! -e "$PROJECT_DIR/.ai-startup-tools" ]
}

@test "IT-BOOT-002: bootstrap --apply --yes で初期化され、再実行しても冪等" {
  run bash scripts/linux/bootstrap.sh --project-dir "$PROJECT_DIR" --apply --yes --non-interactive
  [ "$status" -eq 0 ]
  [ -f "$PROJECT_DIR/.ai-startup-tools/config.yml" ]
  [ -f "$PROJECT_DIR/.ai-startup-tools/profile.yml" ]

  run bash scripts/linux/bootstrap.sh --project-dir "$PROJECT_DIR" --apply --yes --non-interactive
  [ "$status" -eq 0 ]
}

@test "IT-BOOT-003: プロジェクト外へのパスは安全違反になる" {
  run bash scripts/linux/bootstrap.sh --project-dir / --dry-run
  [ "$status" -eq 5 ]
}

@test "IT-TPL-001: テンプレート生成 dry-run は書き込みなし" {
  run bash scripts/linux/render-template.sh \
    --template templates/requirements \
    --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=Demo --set PROJECT_SLUG=demo --dry-run
  [ "$status" -eq 0 ]
  [ ! -e "$PROJECT_DIR/demo_要件定義書.md" ]
}

@test "IT-TPL-002: 未解決変数がある場合は失敗する" {
  run bash scripts/linux/render-template.sh \
    --template templates/requirements \
    --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=Demo --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *"必須変数"* ]]
}

@test "IT-TPL-003: 既存ファイルとの衝突は終了コード 6 で失敗する" {
  run bash scripts/linux/render-template.sh \
    --template templates/requirements \
    --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=Demo --set PROJECT_SLUG=demo --apply --yes
  [ "$status" -eq 0 ]
  [ -f "$PROJECT_DIR/demo_要件定義書.md" ]

  run bash scripts/linux/render-template.sh \
    --template templates/requirements \
    --project-dir "$PROJECT_DIR" \
    --set PROJECT_NAME=Demo --set PROJECT_SLUG=demo --apply --yes
  [ "$status" -eq 6 ]
}
