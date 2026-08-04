# WebUI（プロジェクト選択・操作画面）

Linux 上に展開し、ブラウザからプロジェクト一覧の表示・選択・診断・初期化、および Windows 側への SSH 経由の操作を提供します。

## 動作環境

- Linux（Ubuntu LTS 推奨）
- Node.js 20 以上
- OpenSSH クライアント（Windows への SSH 接続に使用）

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `AI_WEBUI_HOST` | `127.0.0.1` | 待受アドレス。LAN 公開時は `0.0.0.0` とトークン必須 |
| `AI_WEBUI_PORT` | `8080` | 待受ポート（`0` でランダムポート） |
| `AI_WEBUI_TOKEN` | 未設定 | 設定すると全 `/api/*` に `x-auth-token` ヘッダーが必須 |
| `AI_WEBUI_RATE_LIMIT_PER_MINUTE` | `120` | 1 IP あたり毎分の API リクエスト上限 |
| `AI_WEBUI_LOG_DIR` | `.ai-startup-tools/logs` | JSONL 監査ログの出力先 |
| `AI_WEBUI_TRUST_PROXY` | `0` | `1` のとき `X-Forwarded-For` をレート制限の IP 判定に使用 |
| `AI_WEBUI_PROJECTS_ROOT_LINUX` | `~/projects` | Linux プロジェクトルート（カンマ区切りで複数可） |
| `AI_WEBUI_WINDOWS_HOST` | 未設定 | Windows SSH ホスト |
| `AI_WEBUI_WINDOWS_USER` | 未設定 | Windows SSH ユーザー |
| `AI_WEBUI_WINDOWS_PROJECTS_ROOT` | `C:\projects` | Windows プロジェクトルート（カンマ区切りで複数可） |
| `AI_WEBUI_WINDOWS_TOOLKIT_ROOT` | `D:\AI-Coding-Startup-Tools` | Windows 側のツールキット展開先 |

## 起動方法

```bash
cd AI-Coding-Startup-Tools
AI_WEBUI_PROJECTS_ROOT_LINUX=/home/user/projects \
AI_WEBUI_WINDOWS_HOST=192.168.0.143 \
AI_WEBUI_WINDOWS_USER=user \
AI_WEBUI_WINDOWS_PROJECTS_ROOT='C:\projects' \
AI_WEBUI_WINDOWS_TOOLKIT_ROOT='D:\AI-Coding-Startup-Tools' \
node webui/server.mjs
```

ブラウザで `http://127.0.0.1:8080` を開きます。

設定例は [webui.env.example](./webui.env.example) を参照してください。設定はすべて環境変数で行います（`AI_WEBUI_*`）。

### 死活監視

監視・systemd ヘルスチェック用に、認証なし・設定情報を含まない `/api/healthz` を提供します。

```bash
curl -s http://127.0.0.1:8080/api/healthz
# {"ok":true,"toolkitVersion":"0.2.0"}
```

### 複数のプロジェクトルートを使う場合

`AI_WEBUI_PROJECTS_ROOT_LINUX` と `AI_WEBUI_WINDOWS_PROJECTS_ROOT` は、カンマ区切りで複数のルートフォルダを指定できます。

```bash
AI_WEBUI_PROJECTS_ROOT_LINUX=/home/user/Mirai-Project,/home/user/Mirai-DX-Project \
AI_WEBUI_WINDOWS_PROJECTS_ROOT='D:\Mirai-Project,D:\Mirai-DX-Project' \
node webui/server.mjs
```

WebUI 画面ではルートごとにプルダウンが表示され、切り替えるとそのルート配下のプロジェクト一覧に更新されます。ルート名はパスの末尾セグメント（例: `Mirai-Project`）から自動的に表示されます。

## プロジェクトの判定基準

各プロジェクトルート直下のフォルダのうち、**以下を両方持つもの**をプロジェクトとして一覧表示します。

1. `.git`（Git リポジトリ）
2. `.ai-startup-tools/`（bootstrap 済み）

## WebUI でできること

| 対象 | 操作 |
|---|---|
| Linux | プロジェクト一覧・選択、環境診断、初期化（dry-run / 適用）、テンプレート生成（要件定義・設計・レビュー・リリース） |
| Windows (SSH) | プロジェクト一覧・選択、Claude/Codex 導入確認、起動前検査 |

対話的な Claude Code / Codex の起動は TTY が必要なため、WebUI ではなくコンソールの `select-project.sh` または既存の launch スクリプトを使用します。

## 画面構成

ログイン後、左側のサイドバーから次の画面を切り替えられます。

| 画面 | 内容 |
|---|---|
| ダッシュボード | 接続状態、Linux/Windows のプロジェクト件数などのサマリー |
| Linux | ルート選択、プロジェクト一覧・選択、環境診断、初期化（dry-run / 適用） |
| Windows (SSH) | ルート選択、プロジェクト一覧・選択、Claude/Codex 導入確認、起動前検査（SSH 経由） |
| テンプレート生成 | 要件定義・設計・レビュー・リリースの雛形生成（Linux 上の既存プロジェクトが対象。Windows は非対応） |
| 実行結果 | 直近の実行結果（標準出力・標準エラー、単一/分割表示） |
| 実行履歴 | 過去の実行結果一覧（ブラウザの localStorage に保存、最大 50 件、機微情報は含まない） |
| 設定 | 接続先トークンの設定・削除 |

各操作画面から、Claude Code / Codex の起動シーケンスをシミュレーション表示する CLI ドロワーを開けます。実際の対話的セッションではなく表示のみです（実行方法は上記の TTY 起動を参照）。

## Windows 側の準備（SSH サーバー）

1. Windows に OpenSSH Server を導入し、サービスを開始する。
2. ファイアウォールで TCP 22 番を許可する。
3. Linux 側から鍵認証で接続できるよう、公開鍵を `authorized_keys` に登録する。
4. 必要に応じて既定シェルを PowerShell に設定する。
5. Windows 側にも本リポジトリを展開し、`AI_WEBUI_WINDOWS_TOOLKIT_ROOT` にそのパスを設定する。

## セキュリティ上の注意

- 既定では `127.0.0.1` にのみバインドします。LAN 公開する場合は `AI_WEBUI_HOST=0.0.0.0` と `AI_WEBUI_TOKEN` を必ず設定してください。
- 全レスポンスに `Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy` 等を付与しています。
- `/api/*` は IP 単位のレート制限（既定 120 回/分）と、トークン設定時のタイミングセーフ比較による認証を適用します。
- リクエスト監査ログは `AI_WEBUI_LOG_DIR`（既定 `.ai-startup-tools/logs/webui-audit.jsonl`）へ JSONL で出力します。トークン・秘密値は記録しません。
- SSH 接続は鍵認証（`BatchMode=yes`）を想定しています。パスワード認証は行いません。
- WebUI から実行できる操作はサーバー側で許可リストに限定されています。任意のコマンド実行はできません。
- API キーやパスワードをブラウザ・設定ファイルに保存しないでください。

## systemd での常時起動（例）

```ini
[Unit]
Description=AI Coding Startup Tools WebUI
After=network.target

[Service]
WorkingDirectory=/opt/AI-Coding-Startup-Tools
# 複数ルートを使う場合は "root1,root2" のようにカンマ区切りで指定する
Environment=AI_WEBUI_PROJECTS_ROOT_LINUX=/home/user/projects
Environment=AI_WEBUI_WINDOWS_HOST=192.168.0.143
Environment=AI_WEBUI_WINDOWS_USER=user
ExecStart=/usr/bin/node webui/server.mjs
Restart=on-failure
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

実運用では環境変数を `/etc/ai-coding-startup-tools/webui.env` に置き、`EnvironmentFile=-/etc/ai-coding-startup-tools/webui.env` で読み込むことを推奨します（`deploy/ai-coding-startup-tools-webui.service` 参照）。
