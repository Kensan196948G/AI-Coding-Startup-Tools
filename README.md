# AI Coding Startup Tools

Claude Code / Codex の起動・初期設定・プロンプト・開発テンプレートを一元管理する、配布可能な開発者ツールキットです。

このリポジトリは要件定義書（[AI-Coding-Startup-Tools_要件定義書.md](./AI-Coding-Startup-Tools_要件定義書.md)）と詳細設計仕様書（[AI-Coding-Startup-Tools_詳細設計仕様書.md](./AI-Coding-Startup-Tools_詳細設計仕様書.md)）に基づいて実装されています。

## 特徴

- Claude Code / Codex の安全な起動支援（Linux / Windows）
- 環境診断・初期設定（bootstrap）の共通化
- dry-run 既定、バックアップ、原子的更新、冪等性、ロールバック
- プロンプト・開発テンプレートの一元管理とスキーマ検証
- 秘密情報の混入防止（マスキング、CI 検査、禁止実装の明文化）
- GitHub Flow（PR 必須、保護された main、CODEOWNERS）

## クイックスタート（初心者向け）

### 1. リポジトリ取得

```bash
git clone https://github.com/Kensan196948G/AI-Coding-Startup-Tools.git
cd AI-Coding-Startup-Tools
```

### 2. 環境診断

Linux:

```bash
./scripts/linux/diagnose.sh
```

Windows（PowerShell 7）:

```powershell
./scripts/windows/Test-Environment.ps1
```

### 3. 初期化（まずプレビュー）

Linux:

```bash
./scripts/linux/bootstrap.sh --dry-run
```

Windows:

```powershell
./scripts/windows/Bootstrap.ps1 -WhatIf
```

### 4. AI ツールの起動

Claude Code:

```bash
./claude-code/linux/launch.sh
```

```powershell
./claude-code/windows/Start-ClaudeCode.ps1
```

Codex:

```bash
./codex/linux/launch.sh
```

```powershell
./codex/windows/Start-Codex.ps1
```

## 主な機能

| 機能 | Linux | Windows |
|---|---|---|
| 環境診断 | `./scripts/linux/diagnose.sh` | `./scripts/windows/Test-Environment.ps1` |
| 初期化 | `./scripts/linux/bootstrap.sh` | `./scripts/windows/Bootstrap.ps1` |
| Claude 起動 | `./claude-code/linux/launch.sh` | `./claude-code/windows/Start-ClaudeCode.ps1` |
| Codex 起動 | `./codex/linux/launch.sh` | `./codex/windows/Start-Codex.ps1` |
| 雛形生成 | `./scripts/linux/render-template.sh` | `./scripts/windows/New-ProjectFromTemplate.ps1` |

## WebUI（プロジェクト選択・操作画面）

Linux 上で実行し、ブラウザからプロジェクトの一覧・選択・診断・初期化を行えます。Windows 側は SSH 経由で PowerShell スクリプトを実行します。

```bash
AI_WEBUI_PROJECTS_ROOT_LINUX=/home/user/projects \
AI_WEBUI_WINDOWS_HOST=192.168.0.143 \
AI_WEBUI_WINDOWS_USER=user \
node webui/server.mjs
```

`AI_WEBUI_PROJECTS_ROOT_LINUX` はカンマ区切りで複数ルートを指定でき、WebUI 上でルートを選択できます。詳細は [webui/README.md](./webui/README.md) を参照してください。

コンソールで選択する場合は `./scripts/linux/select-project.sh`（Windows は `Select-Project.ps1`）を使用します。

### 死活監視（systemd 等）

トークン設定時も認証なしで使える最小死活監視エンドポイントを用意しています。

```bash
curl -s http://127.0.0.1:8080/api/healthz
```

`/api/health` は設定情報（プロジェクトルート、Windows ホスト等）を含むため、`AI_WEBUI_TOKEN` 設定時は `x-auth-token` ヘッダーが必要です。

## 安全上のルール

- 既定動作は読取り・診断・プレビューです。ファイル変更は明示的なオプションと確認を必要とします。
- `--yes` を指定しても、main へのマージ、本番デプロイ、外部への送信、再帰削除、Secrets 変更などは自動承認されません。
- API キー、トークン、秘密鍵、実値入り `.env` をこのリポジトリへコミットしないでください。
- WebUI は既定で `127.0.0.1` のみにバインドし、CSP（`script-src 'self'`）・各種セキュリティヘッダー、トークン認証（タイミングセーフ比較）、Host / Origin 検証、IP 単位レート制限、JSONL 監査ログを備えています。LAN 公開時は `AI_WEBUI_HOST=0.0.0.0` と `AI_WEBUI_TOKEN` の設定が**必須**です（未設定のまま非ループバックで起動すると fail-closed により起動を拒否します）。
- WebUI から Codex を起動する際の全権限モード（YOLO）は既定で無効です。有効化するには `AI_WEBUI_ALLOW_DANGEROUS=1` を明示的に設定してください。
- 障害時は systemd `OnFailure` から Webhook 通知（`AI_ALERT_WEBHOOK_URL` 設定時のみ）を送信できます。
- 詳細は [common/policies/safety.md](./common/policies/safety.md)、[common/policies/secrets.md](./common/policies/secrets.md)、[common/policies/approvals.md](./common/policies/approvals.md) を参照してください。

## 管理者向け

- [導入・更新・ロールバック](./docs/guides/)
- [アーキテクチャ](./docs/architecture/)
- [トラブルシューティング](./docs/troubleshooting/)
- [移行記録](./docs/migration/)

## ライセンス

本リポジトリは [MIT License](./LICENSE) で提供されます。社内利用の際は、機密区分（秘密情報・会社データ格納禁止）に従ってください。
