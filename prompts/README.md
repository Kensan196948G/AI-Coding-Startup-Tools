# プロンプト

プロンプトは Markdown + YAML Front Matter で管理します。メタデータ仕様は `common/schemas/prompt.schema.json` を参照してください。

| ディレクトリ | 内容 |
|---|---|
| `common/` | ツール共通プロンプト（discovery / implementation / review） |
| `goal/` | 目標定義プロンプト |
| `development/` | 実装プロンプト |
| `debug/` | Deep Debugプロンプト |
| `review/` | レビュープロンプト |
| `release/` | リリース判定プロンプト |
| `examples/` | 利用例 |

全プロンプトは CI（`validate-prompts`）で以下を検査されます。

- Front Matter のスキーマ適合
- 変数の宣言・使用・未解決の整合
- 承認ゲートの必須化
- 禁止パターン（`eval` / `Invoke-Expression` / `curl | sh` 等）の非含有
