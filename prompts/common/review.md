---
schemaVersion: 1
id: review
title: 変更レビュー
targets: [opencode]
phase: review
variables: [REVIEW_TARGET, REVIEW_CRITERIA]
approvalGates: [merge_main]
updatedAt: 2026-08-04
---

# 目的

{{REVIEW_TARGET}} をレビューし、判定と是正案を提示してください。

# 評価軸

{{REVIEW_CRITERIA}}

# 出力形式

- 各指摘に重大度（Critical / High / Medium / Low）と根拠（ファイル・行・動作）を付す。
- 是正が必要な場合は具体的な修正案を提示する。
- 総合判定（承認 / 条件付き承認 / 差戻し）と理由を明記する。
- main へのマージが必要な場合は停止して承認を待つ。
