# Linux への展開・WebUI 起動手順

この手順は、Linux（Ubuntu LTS 想定）に本リポジトリを展開し、WebUI を起動するためのものです。

## 前提

- Linux 側で SSH サーバー（openssh-server）が起動していること
- Linux 側に Node.js 20 以上がインストールされていること
- このドキュメントを読んでいる作業端末（Windows 等）から Linux へ SSH 接続できること

## 手順1: リポジトリを Linux へ展開

Linux 側で直接取得する場合:

```bash
cd ~
git clone https://github.com/Kensan196948G/AI-Coding-Startup-Tools.git
cd AI-Coding-Startup-Tools
```

作業端末（Windows）から scp / rsync で送る場合:

```powershell
scp -r D:\AI-Coding-Startup-Tools <user>@<linux-host>:~
```

## 手順2: 依存関係と検証

```bash
cd ~/AI-Coding-Startup-Tools
npm ci
npm run validate
npm test
```

## 手順3: プロジェクトルートの用意

WebUI が一覧表示するプロジェクトルートを作成し、プロジェクトを配置します。

```bash
mkdir -p ~/projects
cd ~/projects
git clone <対象プロジェクト> sample-app
cd sample-app
~/AI-Coding-Startup-Tools/scripts/linux/bootstrap.sh --apply --yes --non-interactive
```

WebUI は Git リポジトリ（`.git`）をすべて表示し、bootstrap 済み（`.ai-startup-tools/`）かどうかを状態バッジで区別します。

## 手順4: 動作確認（フォアグラウンド）

```bash
cd ~/AI-Coding-Startup-Tools
AI_WEBUI_PROJECTS_ROOT_LINUX=$HOME/projects \
node webui/server.mjs
```

複数のプロジェクトルートを使う場合は、カンマ区切りで指定します（例: `AI_WEBUI_PROJECTS_ROOT_LINUX=$HOME/Mirai-Project,$HOME/Mirai-DX-Project`）。WebUI 上でルートを選択できます。

別ターミナルで確認:

```bash
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/healthz
curl http://127.0.0.1:8080/api/linux/projects
```

`/api/healthz` はトークン設定時も認証不要の死活監視用です。`/api/health` は設定情報を含むため、
`AI_WEBUI_TOKEN` を設定している場合は `x-auth-token` ヘッダーが必要です。

## 手順5: systemd で常時起動

テンプレートを配置します。

```bash
sudo cp deploy/ai-coding-startup-tools-webui.service /etc/systemd/system/
```

必要に応じて `/etc/systemd/system/ai-coding-startup-tools-webui.service` の
`User`、`WorkingDirectory`、`Environment=` を編集します。
環境変数が多くなる場合は `/etc/ai-coding-startup-tools/webui.env`（所有者 root、パーミッション 600）
に置き、`EnvironmentFile=-/etc/ai-coding-startup-tools/webui.env` で読み込みます。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-coding-startup-tools-webui
sudo systemctl status ai-coding-startup-tools-webui
curl -s http://127.0.0.1:8080/api/healthz
```

## 手順6: Windows 側の SSH 接続確認

Windows 側に OpenSSH Server を設定した後、接続確認スクリプトを実行します。

```bash
./scripts/linux/check-windows-ssh.sh \
  --host 192.168.0.143 \
  --user <windows-user> \
  --projects-root 'C:\projects'
```

Windows 側の設定は [windows-ssh-server.md](./windows-ssh-server.md) を参照してください。

## ファイアウォール（Linux 側）

WebUI を LAN 公開する場合（非推奨だが必要な場合）:

```bash
sudo ufw allow 8080/tcp
```

その場合は `AI_WEBUI_HOST=0.0.0.0` と `AI_WEBUI_TOKEN` を必ず設定してください。
