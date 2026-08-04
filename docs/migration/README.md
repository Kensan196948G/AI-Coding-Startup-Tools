# 統合・移行記録

7 つの統合元リポジトリの資産を本リポジトリへ統合するための記録です。

| ファイル | 内容 |
|---|---|
| `inventory.yml` | 資産台帳（出典・採否・移行先・状態） |
| `conflict-report.md` | 重複・競合の判定記録 |
| `archive-map.md` | 廃止予定資産の追跡 |

台帳は CI（`validate-migration`）でスキーマ・出典・状態の整合を検査されます。

## 棚卸しツール

統合元リポジトリへアクセスできるようになったら、棚卸しエントリを自動生成できます。

```bash
node scripts/migration/build-inventory.mjs \
  --repo-dir ../Claude-StartUpTools-New-Linux \
  --source-repository Claude-StartUpTools-New-Linux \
  --out docs/migration/inventory.new.yml
```

生成されたエントリは `decision: unresolved`（要レビュー）で出力されます。内容確認後に `docs/migration/inventory.yml` へマージし、`decision` / `status` を更新してください。

各フェーズの進め方は [phase-checklist.md](./phase-checklist.md) を参照してください。
