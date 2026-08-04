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
  - WebUI（プロジェクト一覧・選択・診断・初期化、SSH 経由の Windows 操作、複数プロジェクトルートの選択）
  - WebUI からのテンプレート生成（要件定義・設計・レビュー・リリース）
  - プロジェクト選択メニュー（`select-project.sh` / `Select-Project.ps1`）
  - Linux 展開手順・systemd ユニット・Windows SSH 接続確認スクリプト
  - Windows OpenSSH Server 設定ガイド
  - 移行棚卸しツール（`build-inventory.mjs`）とフェーズチェックリスト
  - プロンプト一式と検証スクリプト
  - 要件定義・設計・レビュー・リリースの 4 テンプレート
  - テスト（Bats / Pester / Node）
  - GitHub Actions CI / security / release

### Changed

- WebUI のフロントエンド（`webui/public/index.html`）を Claude Design 由来の新デザインへ全面刷新。ログイン・ダッシュボード・Linux プロジェクト・Windows プロジェクト・テンプレート生成・実行ログ・履歴・設定の8画面と、起動シミュレーション表示用の CLI ドロワーを実装。ビルドツールや追加依存パッケージなしのバニラ JS SPA 構成を維持。
- `/api/health` のレスポンス `config` に `windowsUser` と `windowsToolkitRoot`（Windows ホスト未設定時は `null`）を追加。

### Fixed

- WebUI フロントエンドがアクション実行結果の成功/失敗判定でサーバーの実際のレスポンスフィールドと異なる名前（`code`）を参照しており、判定が常に不正確だった問題を修正。サーバー側 API（`webui/server.mjs`）はもともと正しく `exitCode` を返していたため、修正はフロントエンドの参照フィールド訂正のみ。

### Security

- WebUI の `/api/windows/action`（`launch-check-*`）で、`projectPath` がルート配下チェックのみでSSH経由のPowerShell/cmd.exeコマンド文字列へ埋め込まれ、二重引用符などのメタ文字によるコマンドインジェクションが可能だった問題を修正。`webui/lib/projects.mjs` に許可文字を厳密に限定する `isSafeWindowsPath` を追加し、`webui/server.mjs` のルート外チェック直後に適用。単体・統合の回帰テストを追加。

## [0.1.0] - 2026-08-04

### Added

- リポジトリ骨格、要件定義書、詳細設計仕様書
