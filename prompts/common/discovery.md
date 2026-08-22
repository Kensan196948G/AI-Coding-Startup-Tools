---
schemaVersion: 1
id: discovery
title: 状況調査と課題整理
targets: [opencode]
phase: discovery
variables: [PROJECT_NAME, QUESTIONS]
approvalGates: [external_write]
updatedAt: 2026-08-04
---

# 目的

{{PROJECT_NAME}} の現状を調査し、課題と論点を整理してください。

# 調査項目

{{QUESTIONS}}

# 制約

- 読取り専用で調査し、ファイル変更や外部通信を行わない。
- 調査結果は証拠（パス・コマンド・出力）とともに日本語で報告する。
- 不明な点は推測せず、確認事項として明示する。
- 外部への送信が必要な場合は停止して承認を待つ。
