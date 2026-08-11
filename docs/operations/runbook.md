# 運用 Runbook

本番環境の AI Coding Startup Tools WebUI を安定稼働させるための運用手順です。

## 前提

- デプロイ先: Linux ホスト（Ubuntu LTS 推奨）
- 起動方式: systemd（`deploy/ai-coding-startup-tools-webui.service`）
- 監視: `systemctl status` + `/api/healthz`
- ログ: journald + JSONL 監査ログ（`AI_WEBUI_LOG_DIR`）

## 日次チェック（5分）

| # | 項目 | コマンド | 正常判定 |
|---|---|---|---|
| 1 | サービス稼働確認 | `systemctl is-active ai-coding-startup-tools-webui` | `active` |
| 2 | 死活監視 | `curl -s http://127.0.0.1:8080/api/healthz` | `"ok":true`, diskLow=false |
| 3 | 直近エラー確認 | `journalctl -u ai-coding-startup-tools-webui --since "24 hours ago" -p err` | 出力なし、または既知の非クリティカルエラーのみ |
| 4 | ディスク空き容量 | `df -h /var/log` | 使用率 < 80% |
| 5 | 監査ログサイズ | `ls -lh AI_WEBUI_LOG_DIR/webui-audit.jsonl` | 異常な増加がないこと（通常 < 10MB/日） |

### 異常時の初動

1. `systemctl restart ai-coding-startup-tools-webui` で再起動
2. 復旧しない場合 → [障害対応フロー](#障害対応フロー) へ

## 週次チェック（15分）

| # | 項目 | コマンド | 正常判定 |
|---|---|---|---|
| 1 | ローテーション確認 | `ls -lt AI_WEBUI_LOG_DIR/webui-audit.jsonl.*.gz` | 最新7世代が存在 |
| 2 | レート制限誤検知 | `grep "429\|Too Many" AI_WEBUI_LOG_DIR/webui-audit.jsonl` | 異常な増加がない |
| 3 | 認証失敗 | `grep "401\|Unauthorized" AI_WEBUI_LOG_DIR/webui-audit.jsonl` | 想定外の失敗がない |
| 4 | セッション異常終了 | `grep "session.error\|session.stop" AI_WEBUI_LOG_DIR/webui-audit.jsonl` | 異常終了パターンを確認 |
| 5 | 依存パッケージ更新確認 | `npm outdated`（ツールキットルートで） | セキュリティ修正があれば更新計画 |
| 6 | Python健全性 | `python3 -c "import pty,fcntl,termios,selectors,struct;print('ok')"` | `ok` |

## 月次チェック（30分）

| # | 項目 | 手順 | 正常判定 |
|---|---|---|---|
| 1 | バックアップ | ツールキットディレクトリ全体を tar.gz でバックアップ | 復元テスト成功 |
| 2 | セキュリティスキャン | `npm audit --audit-level=high` | high/critical 0件 |
| 3 | シークレットスキャン | `node scripts/validation/scan-secrets.mjs` | 検出なし |
| 4 | 全テスト再実行 | `npm test && npm run validate` | 全合格 |
| 5 | 監査ログアーカイブ | 30日以上前のログを別ストレージへ移動 | 移動成功 |
| 6 | systemd ユニット再読込 | `systemctl daemon-reload`（ユニット変更時） | エラーなし |
| 7 | 再起動テスト | 計画メンテナンス時間に `systemctl restart` | 正常起動・healthz OK |

## 障害対応フロー

### Level 1: サービス応答なし

```
1. curl http://127.0.0.1:8080/api/healthz で確認
2. systemctl restart ai-coding-startup-tools-webui
3. 30秒待機 → healthz 再確認
4. 復旧しない → Level 2
```

### Level 2: 再起動でも復旧しない

```
1. journalctl -u ai-coding-startup-tools-webui -n 100 でエラー確認
2. ポート競合確認: ss -tlnp | grep 8080
3. python3 確認: python3 --version
4. ディスク容量確認: df -h
5. Node.js 確認: node --version (>=20 必須)
6. 依存パッケージ確認: npm ci (node_modules 破損時)
7. 復旧しない → Level 3
```

### Level 3: ロールバック

```
1. 直前の安定バージョンを特定: git tag -l 'v*' --sort=-version:refname | head -3
2. ロールバック実行:
   cd AI-Coding-Startup-Tools
   git fetch --tags
   git stash  # 未コミット変更を退避
   git checkout v<安定バージョン>
   npm ci
   systemctl restart ai-coding-startup-tools-webui
3. healthz 確認
4. 復旧しない → Level 4
```

### Level 4: 手動復旧・エスカレーション

```
1. 全ログ取得:
   journalctl -u ai-coding-startup-tools-webui --since "1 hour ago" > /tmp/webui-crash.log
   cp AI_WEBUI_LOG_DIR/webui-audit.jsonl /tmp/webui-audit.log
2. メンテナーへ連絡（SECURITY.md 参照）
3. 暫定対応として WebUI 停止も検討:
   systemctl stop ai-coding-startup-tools-webui
```

## Rollback 手順

### 事前確認

```bash
# 現在のバージョン
cd AI-Coding-Startup-Tools
node -e "console.log(require('./package.json').version)"

# 利用可能な安定版タグ
git tag -l 'v*' --sort=-version:refname
```

### 実行

```bash
cd AI-Coding-Startup-Tools
CURRENT=$(git rev-parse --short HEAD)

# 1. 現在の状態を保存
git stash

# 2. ロールバック先をチェックアウト
git checkout v0.2.0

# 3. 依存関係を再インストール
npm ci

# 4. 検証
npm run validate && npm test

# 5. 再起動
sudo systemctl restart ai-coding-startup-tools-webui

# 6. 確認
sleep 3
curl -s http://127.0.0.1:8080/api/healthz

# 復旧失敗時は元に戻す
# git checkout $CURRENT && npm ci && sudo systemctl restart ai-coding-startup-tools-webui
```

## 監視閾値（SLI/SLO）

| SLI | 測定方法 | SLO |
|---|---|---|
| 可用性 | `/api/healthz` の 200 応答率 | 99.5%（月間） |
| 応答時間 | `/api/healthz` の p95 レイテンシ | < 200ms |
| エラーレート | 5xx 応答の割合 | < 1%（日次） |
| ディスク | 空き容量 | > 10% または > 1GB |
| レート制限誤検知 | 429 応答数 | < 10件/日 |

## バックアップ・復元

### バックアップ対象

- ツールキット本体（Git 管理のため正本は GitHub）
- 監査ログ（`AI_WEBUI_LOG_DIR`）
- `.ai-startup-tools/backups/`（bootstrap のバックアップ）
- 環境設定ファイル（`/etc/ai-coding-startup-tools/webui.env`）

### バックアップコマンド

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/ai-coding-startup-tools"
DATE=$(date +%Y%m%d)
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/audit-logs-$DATE.tar.gz" -C "$(dirname "$AI_WEBUI_LOG_DIR")" "$(basename "$AI_WEBUI_LOG_DIR")"
cp /etc/ai-coding-startup-tools/webui.env "$BACKUP_DIR/webui.env.$DATE"
# 7世代保持
ls -t "$BACKUP_DIR"/audit-logs-*.tar.gz | tail -n +8 | xargs -r rm
```

### 復元手順

```bash
# 監査ログの復元
tar -xzf /var/backups/ai-coding-startup-tools/audit-logs-YYYYMMDD.tar.gz -C /
# 設定の復元
cp /var/backups/ai-coding-startup-tools/webui.env.YYYYMMDD /etc/ai-coding-startup-tools/webui.env
systemctl restart ai-coding-startup-tools-webui
```

## 定例タスク一覧

| 周期 | タスク | 担当 | 所要時間 |
|---|---|---|---|
| 日次 | 稼働確認・healthz・エラーチェック | 運用担当 | 5分 |
| 週次 | ログ分析・パッケージ更新確認・Python健全性 | 運用担当 | 15分 |
| 月次 | バックアップ・セキュリティスキャン・全テスト | 運用担当 | 30分 |
| 四半期 | 脆弱性・依存関係棚卸し・EOL/EOS確認・権限棚卸し | セキュリティ担当 | 1時間 |
| 年次 | 証明書・ドメイン・シークレット更新・ライセンス監査 | 管理者 | 2時間 |

## 連絡先

- メンテナー: SECURITY.md 参照
- 緊急時: 本番ホスト管理者
- リポジトリ: https://github.com/Kensan196948G/AI-Coding-Startup-Tools
