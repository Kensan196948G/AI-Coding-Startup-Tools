# Changelog

本プロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added

- 初期リポジトリ構築（v1.0 開発中）
  - 共通設定（defaults / compatibility / logging）
  - JSON Schema（profile / prompt / compatibility / migration-inventory）
  - 安全ポリシー（safety / secrets / approvals）
  - Claude Code / Codex の起動スクリプト（Linux / Windows）
  - 環境診断・bootstrap・テンプレート生成スクリプト
  - WebUI（プロジェクト一覧・選択・診断・初期化、SSH 経由の Windows 操作）
  - WebUI からのテンプレート生成（要件定義・設計・レビュー・リリース）
  - プロジェクト選択メニュー（`select-project.sh` / `Select-Project.ps1`）
  - Linux 展開手順・systemd ユニット・Windows SSH 接続確認スクリプト
  - Windows OpenSSH Server 設定ガイド
  - 移行棚卸しツール（`build-inventory.mjs`）とフェーズチェックリスト
  - プロンプト一式と検証スクリプト
  - 要件定義・設計・レビュー・リリースの 4 テンプレート
  - テスト（Bats / Pester / Node）
  - GitHub Actions CI / security / release

### Security

- WebUI の `/api/windows/action`（`launch-check-*`）で、`projectPath` がルート配下チェックのみでSSH経由のPowerShell/cmd.exeコマンド文字列へ埋め込まれ、二重引用符などのメタ文字によるコマンドインジェクションが可能だった問題を修正。`webui/lib/projects.mjs` に許可文字を厳密に限定する `isSafeWindowsPath` を追加し、`webui/server.mjs` のルート外チェック直後に適用。単体・統合の回帰テストを追加。

## [0.1.0] - 2026-08-04

### Added

- リポジトリ骨格、要件定義書、詳細設計仕様書
