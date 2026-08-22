# 廃止予定資産の追跡

廃止予定の資産は即時削除せず、移行検証完了までこの表で追跡します。

| 統合元リポジトリ | 元パス | 状態 | 代替先 | 廃止予定日 |
|---|---|---|---|---|
| ClaudeCode-System-Development-Documents | prompts/release.md | 代替済み | prompts/common/review.md | 移行検証完了後 |
| Codex-StartUpTools | docs/history.md | 判定中 | docs/migration/conflict-report.md | 未定 |
| 本リポジトリ | `claude-code/` | 保持中 | OpenCode Adapter、Workspace限定Session | Gate G3・回帰試験合格後 |
| 本リポジトリ | `codex/` | 保持中 | OpenCode Adapter、Workspace限定Session | Gate G3・回帰試験合格後 |
| 本リポジトリ | `prompts/claude-code/` | 保持中 | `prompts/`のOpenCode／DeepSeek共通Prompt | 参照検索・Prompt検証後 |
| 本リポジトリ | `prompts/codex/` | 保持中 | `prompts/`のOpenCode／DeepSeek共通Prompt | 参照検索・Prompt検証後 |
| 本リポジトリ | `CLAUDE.md` | 保持中 | `AGENTS.md` | 指示正本切替・参照検索後 |

削除が必要な場合は、別承認と復元可能なバックアップを必須とします。文書更新時点では上記資産を削除していません。
