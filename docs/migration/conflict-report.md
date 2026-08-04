# 競合・重複判定レポート

Phase 1 で実施する重複・競合・秘密情報・旧仕様の検出結果を記録します。

| 判定 | 条件 | 処理 |
|---|---|---|
| identical | SHA-256 一致 | 1 件だけ採用し出典を複数記録 |
| semantic-duplicate | 目的同一・実装差異 | テスト比較後に共通化 |
| platform-specific | OS 固有差分 | 対応 OS 配下へ分離 |
| tool-specific | Claude / Codex 固有 | 対象ツール配下へ分離 |
| obsolete | 旧 CLI・旧仕様のみ | 採用せず理由と代替先を記録 |
| sensitive | 秘密値・会社データを含む | 移行禁止、履歴浄化を別途判断 |
| unresolved | 判断材料不足 | 隔離し、v1.0 対象外とする |

## 検出対象

- 同一ファイル名の上書きリスク
- 設定・プロンプトの意味的重複
- 秘密情報（API キー、トークン、実値入り `.env`）
- 旧 CLI 仕様（非推奨オプション等）

検出結果は統合元の既定ブランチとコミット SHA を固定した上で、`inventory.yml` へ追記します。

## 実データによる確認（2026-08-05）

| 統合元 | 元エントリ | 実際の配置 | 判定 |
|---|---|---|---|
| Claude-StartUpTools-New-Linux | `scripts/start.sh`（台帳上の想定） | 実体はルート直下 `start.sh`（ClaudeOS メニュー起動） | 台帳を `start.sh` に訂正し、本リポジトリの `claude-code/linux/launch.sh` は安全起動アダプタとして再実装（unify / verified） |
| Codex-StartUpTools-New-Linux | `scripts/launch.sh`（台帳上の想定） | 実体はルート直下 `start.sh`（PowerShell メニュー起動） | 台帳を `start.sh` に訂正し、本リポジトリの `codex/linux/launch.sh` は安全起動アダプタとして再実装（unify / verified） |

元エントリの `scripts/start.sh` / `scripts/launch.sh` は存在しないパスだったため、出典の追跡性を保つために実パスへ訂正しました。
