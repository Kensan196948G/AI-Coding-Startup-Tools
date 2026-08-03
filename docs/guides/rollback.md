# ロールバック手順

## スクリプトによる設定変更の場合

1. 操作 ID を確認する（監査ログ `.ai-startup-tools/logs/audit.jsonl`）。
2. バックアップを確認する（`.ai-startup-tools/backups/<operation-id>/`）。
3. 対象ファイルをバックアップから復元する。

```bash
cp -a .ai-startup-tools/backups/<operation-id>/config.yml .ai-startup-tools/config.yml
```

```powershell
Copy-Item .ai-startup-tools\backups\<operation-id>\config.yml .ai-startup-tools\config.yml -Force
```

4. 復元後、環境診断と dry-run で状態を確認する。

## バージョン更新の場合

```bash
git checkout <直前の安定タグ>
```

ローカル設定は更新前のものが維持されています。
