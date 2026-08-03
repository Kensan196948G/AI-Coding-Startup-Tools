# プロンプト

プロンプトは Markdown + YAML Front Matter で管理します。メタデータ仕様は `common/schemas/prompt.schema.json` を参照してください。

| ディレクトリ | 内容 |
|---|---|
| `common/` | ツール共通プロンプト（discovery / implementation / review） |
| `claude-code/` | Claude Code 固有プロンプト |
| `codex/` | Codex 固有プロンプト |
| `examples/` | 利用例 |

全プロンプトは CI（`validate-prompts`）で以下を検査されます。

- Front Matter のスキーマ適合
- 変数の宣言・使用・未解決の整合
- 承認ゲートの必須化
- 禁止パターン（`eval` / `Invoke-Expression` / `curl | sh` 等）の非含有
