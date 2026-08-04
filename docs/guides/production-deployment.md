# 本番デプロイ手順

本リポジトリの本番デプロイ対象は [ADR-0002](../adr/0002-production-deployment-target.md) の
とおり承認時に確定します。ここでは各案の実行手順を示します。

## 案 A: Linux ホストへの systemd 配置（推奨・フル機能）

1. リリース候補の固定コミットを取得する。

```bash
cd /opt
git clone https://github.com/Kensan196948G/AI-Coding-Startup-Tools.git
cd AI-Coding-Startup-Tools
git checkout <承認済みタグまたはコミット>
npm ci
npm run validate
npm test
```

2. 環境変数ファイルを作成する（秘密値はここにのみ置き、Git へ入れない）。

```bash
sudo mkdir -p /etc/ai-coding-startup-tools
sudo install -m 600 /dev/null /etc/ai-coding-startup-tools/webui.env
# AI_WEBUI_HOST=127.0.0.1
# AI_WEBUI_PORT=8080
# AI_WEBUI_TOKEN=<ランダムな長い値>
# AI_WEBUI_PROJECTS_ROOT_LINUX=/home/user/projects
# AI_WEBUI_WINDOWS_HOST=192.168.0.143
# AI_WEBUI_WINDOWS_USER=user
# AI_WEBUI_WINDOWS_PROJECTS_ROOT='C:\projects'
# AI_WEBUI_WINDOWS_TOOLKIT_ROOT='D:\AI-Coding-Startup-Tools'
```

3. systemd ユニットを配置して起動する。

```bash
sudo cp deploy/ai-coding-startup-tools-webui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-coding-startup-tools-webui
```

4. 本番スモークテストを実施する。

```bash
curl -fsS http://127.0.0.1:8080/api/healthz
curl -fsS -H "x-auth-token: $AI_WEBUI_TOKEN" http://127.0.0.1:8080/api/health
curl -fsS -H "x-auth-token: $AI_WEBUI_TOKEN" http://127.0.0.1:8080/api/linux/projects
```

5. 監視する。

- 死活監視: `/api/healthz`
- 監査ログ: `.ai-startup-tools/logs/webui-audit.jsonl`
- サービス状態: `systemctl status ai-coding-startup-tools-webui`

## 案 B: Cloudflare Pages（静的デモ確認のみ）

WebUI のフロントエンドは Node API なしでもデモモードで表示できますが、
診断・初期化・SSH 操作は実行できません。UI 確認目的に限り利用します。

```bash
wrangler pages deploy webui/public --project-name <承認済みプロジェクト名>
```

## 案 C: GitHub Release 配布

`main` マージ後、SemVer タグを作成すると `.github/workflows/release.yml` が
検証・SHA-256 付き Release を作成します。

```bash
git tag v0.2.1
git push origin v0.2.1
```

## ロールバック

- systemd 配置: 直前タグで `git checkout` し直すか、`git checkout <前バージョン>` 後に再起動。
- Cloudflare Pages: `wrangler rollback` または直前デプロイへ戻す。
- 設定データ: `.ai-startup-tools/backups/<operation-id>/` から復元（[rollback.md](./rollback.md)）。
