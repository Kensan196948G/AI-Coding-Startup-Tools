# 統合・移行記録

7 つの統合元リポジトリの資産を本リポジトリへ統合するための記録です。

| ファイル | 内容 |
|---|---|
| `inventory.yml` | 資産台帳（出典・採否・移行先・状態） |
| `conflict-report.md` | 重複・競合の判定記録 |
| `archive-map.md` | 廃止予定資産の追跡 |

台帳は CI（`validate-migration`）でスキーマ・出典・状態の整合を検査されます。

## 現在の棚卸し状況（2026-08-05 時点）

7 リポジトリすべての既定ブランチとコミット SHA を固定し、読み取り専用で入手済みです。

| 統合元リポジトリ | 状態 | 台帳 |
|---|---|---|
| `Claude-StartUpTools-New-Linux` | 入手済み | `start.sh` → `unify / verified` |
| `Claude-StartUpTools-New-Windows` | 入手済み | `start.bat` → `unify / verified` |
| `ClaudeCode-StartUpTools-New` | 入手済み | `settings.json` → `unresolved / planned` |
| `Codex-StartUpTools` | 入手済み | `docs/source-review.md` → `obsolete / rejected` |
| `Codex-StartUpTools-New-Linux` | 入手済み | `start.sh` → `unify / verified` |
| `Codex-StartUpTools-New-Windows` | 入手済み | `scripts/main/Start-Codex.ps1` → `unify / verified` |
| `ClaudeCode-System-Development-Documents` | 入手済み | 想定パス不存在 → `obsolete / rejected` |

全リポジトリの機械生成棚卸し（合計 2,600 件超）は `build-inventory.mjs` でいつでも再生成できます。
台帳にはレビュー済みの追跡対象エントリのみを保持し、未レビューの自動生成エントリは
採用可否のレビュー後にマージする方針です。

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
