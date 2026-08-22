# 統合・移行記録

> 2026-08-22から、旧 `AI-Coding-Startup-Tools` の統合記録に加え、`DeepSeek-Coding-Tools` へのアーキテクチャ移行を管理します。旧7リポジトリの履歴は削除せず、DeepSeek移行とは別の証跡として保持します。

## 索引

| ファイル | 内容 | 状態 |
|---|---|---|
| [deepseek-migration.md](./deepseek-migration.md) | DeepSeek専用基盤への変更範囲、Gate、判断境界 | ソース移行・ローカル検証完了 |
| [verification-2026-08-22.md](./verification-2026-08-22.md) | 自動試験、ブラウザ確認、実環境待ちの証跡 | 更新済み |
| [phase-checklist.md](./phase-checklist.md) | 旧統合とDeepSeek移行の実行チェックリスト | 更新済み |
| [archive-map.md](./archive-map.md) | 旧Claude／Codex資産を含む廃止候補と代替Gate | 更新済み |
| [conflict-report.md](./conflict-report.md) | 旧仕様と新仕様の競合・名称対応 | 更新済み |
| [inventory.yml](./inventory.yml) | 旧7リポジトリの出典・採否台帳 | 歴史的台帳。内容は維持 |

## DeepSeek移行の状態

| 領域 | 状態 |
|---|---|
| 新要件・設計・変更仕様 | 実装済み |
| OpenCode／Oh My OpenAgent／DeepSeek-only | 実装済み・静的／回帰試験合格 |
| Workspace Manager／多層Sandbox | 実装済み・拒否試験15件合格 |
| 旧実行ランタイム資産撤去 | 実装済み・全回帰試験68件合格 |
| GitHub／Root Folder rename | 実施待ち（merge後） |

上流の現行名称は **Oh My OpenAgent**、npmパッケージ名は **`oh-my-opencode`** です。旧称「Oh My OpenCode」は過去仕様との対応に限って残します。

7 つの統合元リポジトリの資産を本リポジトリへ統合するための記録です。

| ファイル | 内容 |
|---|---|
| `inventory.yml` | 旧統合資産台帳（出典・採否・移行先・状態） |
| `conflict-report.md` | 重複・競合・新旧仕様の判定記録 |
| `archive-map.md` | 廃止予定資産と代替Gateの追跡 |

台帳は CI（`validate-migration`）でスキーマ・出典・状態の整合を検査されます。

## 旧統合の棚卸し状況（2026-08-05 時点）

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
