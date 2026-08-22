---
schemaVersion: 1
id: implementation-safe
title: 安全な実装継続
targets: [opencode]
phase: implementation
variables: [PROJECT_NAME, COMPLETION_CRITERIA]
approvalGates: [production_deploy, merge_main, destructive_change]
updatedAt: 2026-08-04
---

# 目的

{{PROJECT_NAME}} を、既存方針（要件定義・設計仕様）と整合させて実装してください。

# 完了条件

{{COMPLETION_CRITERIA}}

# 安全規則

- 既定の動作は読取り・診断・プレビューとし、ファイル変更は明示的な確認を得てから行う。
- 変更前バックアップ、原子的更新、冪等性、ロールバックを必須とする。
- 停止条件に達したら作業を中断し、利用者の承認を待つ。
  - 本番反映（production_deploy）
  - main へのマージ（merge_main）
  - 破壊的変更・再帰削除（destructive_change）
  - 外部への送信、課金操作
- API キー、トークン、秘密鍵、実値入り `.env` を出力・コミット・ログに含めない。
- 実装内容は変更の目的・対象・影響範囲・検証結果を日本語で報告する。
