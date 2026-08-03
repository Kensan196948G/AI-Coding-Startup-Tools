# CLAUDE.md

このリポジトリは Claude Code 用の開発テンプレート・起動支援資産を含むツールキットです。Claude Code を起動する際は [claude-code/README.md](./claude-code/README.md) と [AGENTS.md](./AGENTS.md) を参照してください。

## 基本方針

- 既定動作は読取り・診断・プレビュー。
- 変更は dry-run → バックアップ → 原子的更新 → 検証の順で行う。
- 高リスク操作（main マージ、本番、削除、外部送信）は自動実行しない。
- 秘密情報をコミット・ログ・引数に含めない。

## Claude Code 固有の注意

- 設定は `claude-code/common/config.example.yml` を基準とし、プロファイルで安全設定を上書きしない。
- 起動前検査（`claude-code/linux/launch.sh` / `Start-ClaudeCode.ps1`）が警告を出す場合は、承認を得るまで起動しない。
