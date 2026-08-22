# AGENTS.md

このリポジトリで DeepSeek Coding Session を操作する際の正本指示です。

## 基本言語・ランタイム

- 基本言語は日本語とする。
- コーディングエンジンは OpenCode、Agent拡張は `oh-my-opencode` を使用する。
- AI ProviderはDeepSeekだけを許可する。Main Agent、SubAgent、fallbackを含め、他Providerが解決された場合は起動を拒否する。
- OpenCodeとAgent拡張は `common/config/deepseek-runtime.yml` のexact versionを使用する。

## Workspace境界

- セッション開始時に選択・検証された単一Workspaceだけを変更できる。
- Workspace外のread/edit、別Project横断、`..`、symlink escape、危険Root指定を拒否する。
- SMBは管理者が事前にmountした許可Rootだけを使用し、Agentにmount権限を与えない。
- Sandbox profileを変更してもWorkspace境界は解除しない。
- 既存ユーザー変更を破壊せず、dirty差分を確認してから編集する。

## 作業前の確認

- 現在のブランチ、dirty 状態、リモート URL を確認する。
- `AGENTS.md` と対象Workspaceの指示を確認する。
- 対象プロジェクトのルートを確認し、パス検証を怠らない。

## 禁止事項

- `main` への直接 push、自動マージ
- 本番デプロイ、外部への送信、課金操作の無承認実行
- Workspace Root削除、再帰・ワイルドカード削除、既存ファイルの無断上書き
- API キー・トークン・秘密鍵の出力・コミット・ログ記録
- `curl | sh` / `Invoke-Expression` によるコード実行
- `sudo`、`su`、`mount`、`umount`、`systemctl`、ディスク・ユーザー・Firewall操作
- 同一失敗の無限反復

## 推奨手順

1. 要件定義書・詳細設計仕様書を精査する。
2. 変更計画（対象ファイル、影響範囲）を提示し、承認を得る。
3. `--dry-run` / `-WhatIf` で変更内容を確認する。
4. 変更前にバックアップを作成し、原子的に更新する。
5. 検証（スキーマ、静的解析、テスト）を実行してから PR を作成する。

## 検証

- 変更後は対象テスト、`npm run validate`、`npm test`、`npm run test:sandbox`、秘密情報検査を実行する。
- 失敗時は原因と影響範囲を記録し、同一試行を3回以上繰り返さない。
- Security、Sandbox、Provider固定のいずれかが未検証ならmergeしない。

<!-- central-github-policy -->
## GitHub運用ポリシー（中央配布）

GitHub運用はこのWorkspaceの記述ではなく、中央ポリシーに従います。

- 正本: /home/kensan/Projects/Deep-Seek-Harness-Project/GITHUB_POLICY.md
- 詳細: /home/kensan/Projects/Deep-Seek-Harness-Project/docs/architecture/CloudflareNeonGitHub自動化仕様.md
- 優先順位: 中央GitHub Policy > GitHub Rulesets > GitHub Actions/CI > Workspace AGENTS.md / CLAUDE.md / README
- main直接push禁止、Required Checks PASS後のSquash Merge、merge後branch削除
