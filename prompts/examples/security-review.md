---
schemaVersion: 1
id: security-review
title: セキュリティレビュー
targets: [opencode]
phase: review
variables: [REVIEW_TARGET, REVIEW_CRITERIA]
approvalGates: [merge_main]
updatedAt: 2026-08-04
---

# 目的

{{REVIEW_TARGET}} のセキュリティ面をレビューしてください。

# 評価軸

{{REVIEW_CRITERIA}}

# 重点確認項目

- 秘密情報（API キー、トークン、秘密鍵）がリポジトリ・ログ・引数に残っていないか
- コマンドインジェクションやパストラバーサルの余地がないか
- 既定動作が読取り・診断・プレビューであり、承認ゲートが維持されているか
- main へのマージが必要な場合は停止して承認を待つ
