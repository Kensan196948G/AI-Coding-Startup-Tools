# コントリビューションガイド

## 開発フロー

GitHub Flow を採用します。

1. `main` から機能ブランチを作成する。
2. 変更をコミットし、Pull Request を作成する。
3. CI（構文・スキーマ・静的解析・テスト・セキュリティ検査）が成功する。
4. 1 名以上のレビューと会話解決を経てマージする。
5. リリースは SemVer タグ + CHANGELOG + リリースノートで行う。

`main` への直接 push は禁止です。

## ブランチ命名

```text
feat/<topic>
fix/<topic>
docs/<topic>
chore/<topic>
```

## 変更時の注意

- 秘密情報をコミットしない（[SECURITY.md](./SECURITY.md)）。
- プロンプト・テンプレートを変更する場合は、メタデータとスキーマ検証を更新する。
- スクリプトは ShellCheck / PSScriptAnalyzer に合格させる。
- 要件 ID に対応するテスト ID を追加し、トレーサビリティを保つ。
- 互換性情報（`common/config/compatibility.yml`）は CI 検証後に更新する。

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/) に準拠します。

```text
feat(scripts): 環境診断に X チェックを追加
fix(claude): 起動前検査のパス検証を修正
docs: トラブルシューティングに事例を追加
```

## レビュー基準

- 安全既定値（dry-run、承認ゲート）が維持されているか
- 冪等性・バックアップ・原子的更新が守られているか
- 秘密値がログ・引数・ファイルに残らないか
- OS 固有差分が共通層を汚染していないか
- テストと要件のトレーサビリティがあるか

## CODEOWNERS

`scripts/**`、`.github/**`、`common/policies/**` の変更はメンテナー承認が必須です。
