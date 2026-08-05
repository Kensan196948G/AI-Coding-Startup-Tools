# Changelog

本プロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added

- WebUI に対話セッション（PTY 中継）を追加。WebSocket `/api/session` で Claude Code / Codex をブラウザ上の実ターミナル（同梱 xterm.js）から操作できるようになった。
  - サーバー: 依存パッケージなしの RFC 6455 WebSocket 実装と、Python 標準ライブラリ製 PTY リレー（`webui/lib/pty_relay.py`）を追加。
  - セッション作成 `POST /api/session` は既存のルート検証・トークン認証・レート制限・監査ログを適用し、起動コマンドは許可リスト（Linux: `launch.sh` / Windows: SSH 経由の `Start-*.ps1`）に限定。
  - 同時接続上限（IP あたり 2 / 全体 16）、セッション有効期限 24 時間、ping/pong ハートビート、切断時の子プロセス終了を実装。
  - フロントエンドの CLI ドロワーをシミュレーションから実セッションへ置換（デモ表示はサーバー未接続時のフォールバックとして維持）。
- WebUI の Codex セッション（Linux）を YOLO モード（`--allow-dangerous`、
  実効フラグ `--dangerously-bypass-approvals-and-sandbox`）で起動するよう変更。
- Windows セッションの起動モードを変更。Claude Code は `--permission-mode auto`、
  Codex は `--yolo`（`Start-Codex.ps1 -Yolo`）で起動する。

### Fixed

- WebUI の対話セッションが systemd 実行環境の PATH で `claude` / `codex` を見つけられない問題を修正。systemd ユニットにユーザー環境の PATH を設定し、セッションの作業ディレクトリをツールキットルートへ統一（プロンプト相対パス解決も合わせて修正）。
- PowerShell スクリプト（`.ps1` / `.psm1`）に UTF-8 BOM を付与し、Windows PowerShell 5.1 で日本語を含むスクリプトがパースエラーになる問題を修正。
- Windows 起動スクリプトへの `-Set` 配列渡しを単一パラメータのカンマ区切りへ修正し、プロンプトパスをスクリプト位置基準の絶対パスへ解決するよう変更（Linux の `launch.sh` も同様に修正）。
- `scripts/linux/lib/common.sh` と `scripts/windows/Bootstrap.ps1` にハードコードされていた `toolkitVersion` を package.json から動的取得するよう統一。以降のバージョン bump で表示が乖離しない。
- WebUI のデモ表示バージョンを package.json と一致するよう修正。
- WebUI の「環境診断」が `diagnose.sh` に未対応の `--project-dir` を渡して失敗する問題を修正（パス検証後に引数なしで実行）。
- `check_prompt_variables` が `--set` 未指定時の空配列展開でクラッシュする問題を修正。
- CLI シミュレーション表示のコマンドを実スクリプトのパス・引数に一致するよう修正（Linux: `--project-dir`、Windows: `claude-code\windows\` 配下と `-ProjectDirectory`）。`/api/health` に `toolkitRoot` を追加。
- `scripts/linux/check-windows-ssh.sh` で、SSH 経由の PowerShell コマンドへ埋め込む Windows パス・ホスト・ユーザー名の許可文字検証を追加（コマンドインジェクション対策）。
- シェル / PowerShell の出力パス検証で、シンボリックリンク・ジャンクション経由のルート外書込みと、`C:\projects2` のようなルート境界の取り違えを拒否するよう修正。

### Security

- WebUI サーバーに CSP・各種セキュリティヘッダー・`X-Request-Id` を追加。
- トークン認証をタイミングセーフ比較へ変更し、トークン設定時は `/api/health` も認証必須化。死活監視用の認証不要 `/api/healthz` を新設。
- `/api/*` に IP 単位のレート制限（既定 120 回/分、`AI_WEBUI_RATE_LIMIT_PER_MINUTE` で変更可）を追加。
- JSONL 形式の WebUI リクエスト監査ログ（`AI_WEBUI_LOG_DIR`、秘密値マスキング済み）を追加。
- 環境変数のバリデーション（ポート・レート制限）と、ハンドラ内エラーの JSON 応答化を追加。

### Changed

- WebUI フロントエンドにレスポンシブ対応（960px 以下でサイドバーをオーバーレイ化）とアクセシビリティ改善（`aria-current` / `aria-label` / `role="dialog"` / `role="status"` / focus-visible / reduced-motion）を追加。
- WebUI のプロジェクト一覧を「Git リポジトリ全表示 + bootstrap 状態バッジ」へ変更（従来は bootstrap 済みのみ表示）。コンソールの `select-project` は従来どおり bootstrap 済みのみ対象。
- systemd ユニット例を `EnvironmentFile` 対応・`UMask=0077`・`NoNewPrivileges=true` に更新。
- `package.json` に `license` / `engines` / `repository` を明記。

### Docs

- README / webui README / 導入ガイドに死活監視（`/api/healthz`）、セキュリティヘッダー、レート制限、監査ログ、環境変数を追記。
- 移行台帳を 7 統合元リポジトリすべての実データ（コミット SHA・SHA-256・起動前検査結果）で更新。旧想定パスの誤りを訂正し、機械生成棚卸しの再生成手順を明記。
- 本番デプロイ計画（ADR-0002・`docs/guides/production-deployment.md`）を追加し、承認後の実行手順と rollback を明確化。

## [0.2.0] - 2026-08-04

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
- `webui/README.md` の画面構成表の表記をフロントエンド実装の実際のラベル（`Linux`、`Windows (SSH)`、`実行結果`、`実行履歴`）に合わせて統一。

### Fixed

- WebUI フロントエンドがアクション実行結果の成功/失敗判定でサーバーの実際のレスポンスフィールドと異なる名前（`code`）を参照しており、判定が常に不正確だった問題を修正。サーバー側 API（`webui/server.mjs`）はもともと正しく `exitCode` を返していたため、修正はフロントエンドの参照フィールド訂正のみ。

### Security

- WebUI の `/api/windows/action`（`launch-check-*`）で、`projectPath` がルート配下チェックのみでSSH経由のPowerShell/cmd.exeコマンド文字列へ埋め込まれ、二重引用符などのメタ文字によるコマンドインジェクションが可能だった問題を修正。`webui/lib/projects.mjs` に許可文字を厳密に限定する `isSafeWindowsPath` を追加し、`webui/server.mjs` のルート外チェック直後に適用。単体・統合の回帰テストを追加。

## [0.1.0] - 2026-08-04

### Added

- リポジトリ骨格、要件定義書、詳細設計仕様書
