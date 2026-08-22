# コントリビューションガイド

## 1. 開発フロー

中央GitHub Policyを最優先とするGitHub Flowを採用します。

1. `main`のbaselineとdirty差分を確認する。
2. `feat/`、`fix/`、`docs/`、`chore/`等のbranchを作成する。
3. 要件ID、影響範囲、実装済み／設計段階／未決を明記する。
4. unit、integration、Sandbox、security、secret scan、buildを実行する。
5. Pull Requestを作成し、Required Checksとレビューを完了する。
6. 承認された方式でSquash Mergeする。`main`直接pushと自動mergeは禁止する。

Repository rename、Secret、systemd、本番deploy、外部送信、課金操作は通常のコード変更に含めず、対象と計画を提示して承認を得ます。

## 2. ランタイム変更規則

- 撤去済み旧ランタイムを再導入せず、必要な履歴は `docs/migration/` で参照する。
- 再利用するWebUI、PTY、Git、監査、安全処理の挙動を保護する。
- Oh My OpenAgentが現行上流名、`oh-my-opencode`がnpmパッケージ名であることを区別する。
- DeepSeek以外のProvider、暗黙fallback、未割当Agentを許可しない。
- 実Model ID、固定版、Sandbox方式を変更するときは検証と互換性証跡を更新する。
- 静的UIやsample configを「実装済み」の根拠にしない。

## 3. 安全な実装

- Workspace Rootは `realpath`で検証し、文字列prefixだけで判定しない。
- Project設定がsystem denyを弱められないようにする。
- `.env`、private key、Token等をread／log／commitしない。
- shell allowlistだけを最終境界にせず、Linux権限・OS Sandboxを併用する。
- 既存ユーザー変更を保護し、無断上書き・再帰削除をしない。
- 同じ失敗を無限反復せず、原因と試行結果を記録する。

詳細は [SECURITY.md](./SECURITY.md) と [詳細設計仕様書](./DeepSeek-Coding-Tools_詳細設計仕様書.md) を参照してください。

## 4. テスト要件

変更対象に応じて以下を追加・更新します。

| 対象 | 必須検証 |
|---|---|
| Workspace | Local／SMB成功系、`..`、symlink、別Project拒否 |
| Provider／Agent | DeepSeek成功系、非DeepSeek、unknown Agent、fallback拒否 |
| Command | 通常開発command成功、sudo／mount／破壊的command拒否 |
| Secret | read、log、Git stagingの拒否／mask |
| WebUI／PTY | 認証、Host／Origin、Session lifecycle、境界継承 |
| Git | dirty保護、Secret scan、main直接push拒否、PR gate |
| 文書 | link、名称、状態表記、要件とtestのtraceability |

Sandbox負試験は隔離されたfixtureで実行し、実ユーザーHOMEや実Projectを対象にしません。

## 5. コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/) に準拠します。

```text
feat(workspace): SMB projectのrealpath検証を追加
fix(provider): subagentの非DeepSeek fallbackを拒否
test(sandbox): symlink escapeの回帰試験を追加
docs: DeepSeek移行台帳を更新
```

## 6. レビュー基準

- Workspace外へ副作用がないか
- Main／SubAgentの実効ProviderがDeepSeekだけか
- 設定不正時にfail-closedか
- Secretが引数、応答、ログ、fixtureへ残らないか
- mode変更でSandbox境界が弱まらないか
- 旧経路の削除に代替・回帰証跡があるか
- 文書が実装済み、設計段階、未決を正確に区別しているか

`scripts/**`、`.github/**`、`common/policies/**`、Provider／Sandbox設定の変更はメンテナー承認を必須とします。
