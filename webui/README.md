# WebUI（プロジェクト選択・操作画面）

Linux 上に展開し、ブラウザからプロジェクト一覧の表示・選択・診断・初期化、および Windows 側への SSH 経由の操作を提供します。

## 動作環境

- Linux（Ubuntu LTS 推奨）
- Node.js 20 以上
- OpenSSH クライアント（Windows への SSH 接続に使用）

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

## Windows 側の準備（SSH サーバー）

1. Windows に OpenSSH Server を導入し、サービスを開始する。
2. ファイアウォールで TCP 22 番を許可する。
3. Linux 側から鍵認証で接続できるよう、公開鍵を `authorized_keys` に登録する。
4. 必要に応じて既定シェルを PowerShell に設定する。
5. Windows 側にも本リポジトリを展開し、`AI_WEBUI_WINDOWS_TOOLKIT_ROOT` にそのパスを設定する。

## セキュリティ上の注意

- 既定では `127.0.0.1` にのみバインドします。LAN 公開する場合は `AI_WEBUI_HOST=0.0.0.0` と `AI_WEBUI_TOKEN` を必ず設定してください。
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

[Install]
WantedBy=multi-user.target
```
