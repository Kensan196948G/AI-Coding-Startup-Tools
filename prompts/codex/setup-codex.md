---
schemaVersion: 1
id: setup-codex
title: Codex セットアップ支援
targets: [codex]
phase: plan
variables: [SETUP_TOPIC, SETUP_CRITERIA]
approvalGates: [external_write, destructive_change]
updatedAt: 2026-08-04
---

# 目的

Codex のセットアップについて、{{SETUP_TOPIC}} を整理し、安全な手順を提示してください。

# セットアップ完了条件

{{SETUP_CRITERIA}}

# 制約

- インストールや設定変更は公式手順に基づき、実行前に差分と影響を提示して承認を得る。
- 未検証の取得コードを実行しない。
- API キー等の秘密情報を出力・ファイル・ログに残さない。
- 外部書込みや破壊的変更が必要な場合は停止して承認を待つ。
