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
| Claude-StartUpTools-New-Windows | `scripts/Start-ClaudeCode.ps1`（台帳上の想定） | 実体は `start.bat` | 台帳を `start.bat` に訂正し、`claude-code/windows/Start-ClaudeCode.ps1` として再実装（unify / verified） |
| ClaudeCode-StartUpTools-New | `config/example.yml`（台帳上の想定） | 該当なし。実在する設定は `Claude/templates/claude/settings.json` | 追跡対象を settings.json に変更し、内容比較後に採否判定（unresolved / planned） |
| Codex-StartUpTools | `docs/history.md`（台帳上の想定） | 実体は `docs/source-review.md` | 履歴資料とは目的が異なり採用しない（obsolete / rejected） |
| Codex-StartUpTools-New-Windows | `scripts/Start-Codex.ps1`（台帳上の想定） | 実体は `scripts/main/Start-Codex.ps1` | 台帳を訂正し、`codex/windows/Start-Codex.ps1` として再実装（unify / verified） |
| ClaudeCode-System-Development-Documents | `templates/requirements.md` / `prompts/release.md` | いずれも存在しない（文書・ガイド群） | テンプレートは本リポジトリで新規設計（obsolete / rejected） |

元エントリの `scripts/start.sh` / `scripts/launch.sh` は存在しないパスだったため、出典の追跡性を保つために実パスへ訂正しました。

## DeepSeek専用基盤への競合判定（2026-08-22）

| 現行／旧仕様 | 新仕様 | 判定 | 処理 |
|---|---|---|---|
| Claude Code／Codexを実行エンジンとする | OpenCodeのみ | incompatible | 新経路の受入試験後に旧実行資産を撤去 |
| 複数AI Providerを前提にできる | DeepSeekのみ | security-critical | 設定と実効値の双方を検査し、他Providerとfallbackを拒否 |
| Oh My OpenCodeという表記 | Oh My OpenAgent | renamed-upstream | 現行上流名を表示し、npm名 `oh-my-opencode` を併記 |
| 複数Project Rootの列挙 | 選択した1 Workspaceへ固定 | needs-hardening | realpath、symlink、mount、OS Sandboxを追加 |
| WebUI／PTY／Git／監査 | 同機能をOpenCodeへ接続 | reusable | 旧経路を直ちに削除せず、回帰試験付きで移植 |
| Windows実行を主要対象に含む | Linuxを主運用環境とする | scope-change | Windows旧資産は移行完了まで保持し、新基盤の実行正本はLinux |
| dry-run／承認ゲート | Workspace内の高い自律性 | semantic-change | 外部・本番・GitHub変更の承認境界は維持し、Workspace内modeだけを拡張 |

### 未解決競合

- OpenCodeと`oh-my-opencode`の固定版・設定Schema
- Agent名変更や追加時の自動検出方式
- DeepSeek論理モデルから実Model IDへのmapping
- bubblewrap／namespaceとEgress enforcementの実装方式
- SMB mountの同一性判定、認証、性能基準

未解決項目はfallbackや仮定で通過させず、Compatibility MatrixまたはADRで決定します。
