# 競合・代替率分析（AI Coding Startup Tools v0.4.0）

> 調査日: 2026-08-12
> 調査方針: 公式サイト・公式ドキュメント・公式 GitHub リポジトリを一次情報とし、
> 確認できない項目は「未確認」と明記。公開情報の更新日も併記する。

## 1. 比較対象

| 製品 | 公式情報 | 更新日（確認日時点） | 種別 |
|---|---|---|---|
| AI Coding Startup Tools（本プロジェクト） | [GitHub](https://github.com/Kensan196948G/AI-Coding-Startup-Tools) | 2026-08-12 | MIT OSS |
| Claude Code / Claude Code Enterprise（Anthropic） | [Admin Setup](https://code.claude.com/docs/en/admin-setup)、[Enterprise overview](https://code.claude.com/docs/en/third-party-integrations) | 2026-07-14〜27 | 商用（Teams $150/席・月（Premium）、Enterprise は見積） |
| OpenAI Codex（CLI / Web / IDE / GitHub 連携） | [GitHub openai/codex](https://github.com/openai/codex)、chatgpt.com/codex | 2026-08 時点 | Apache-2.0 CLI + ChatGPT プラン（Plus/Pro/Business/Edu/Enterprise） |
| teamai-cli（Tencent） | [GitHub](https://github.com/Tencent/teamai-cli) | 2026-08-03 | MIT OSS |
| codi（lehidalgo / synapt-dev） | [GitHub](https://github.com/lehidalgo/codi) | 2026-03-21 | OSS（Windows 非対応・POSIX 専用） |
| 自作シェルスクリプト（ベースライン） | — | — | 社内手製 |

## 2. 機能・導入方式・セキュリティ比較

| 項目 | 本ツール v0.4.0 | Claude Code Enterprise | OpenAI Codex | teamai-cli | codi |
|---|---|---|---|---|---|
| 主要機能 | 安全起動・環境診断・プロンプト/テンプレート管理・WebUI（PTY）・監査ログ・systemd 運用 | 組織管理（server-managed settings・SSO/SCIM・コンプライアンス API・サンドボックス） | ターミナル/Web/IDE エージェント・GitHub 連携・利用量管理（ChatGPT プラン） | スキル/ルール/フック/MCP の git 配布・知識ベース（BM25+graph）・ロール管理 | 単一 `.codi/` から 6 エージェント設定を生成・ドリフト検知・プリコミットフック |
| 対象利用者 | IT/DX 部門 7 名規模の開発チーム | 大企業（座位管理・監査要求あり） | 個人〜企業（ChatGPT プラン） | チーム開発者（マルチエージェント） | マルチエージェント利用チーム・個人 |
| 導入方式 | git clone + bootstrap、systemd | claude.ai 管理コンソール＋MDM/管理設定 | npm/Homebrew/インストーラ | npm + git リポジトリ | npm + curl インストーラ |
| Windows 対応 | 正式対応（PowerShell + SSH） | CLI は対応（管理はクラウド） | CLI/IDE 対応 | 未確認 | 非対応（POSIX のみ） |
| 監査ログ | JSONL + ローテーション + gzip + redact（自前） | コンプライアンス API / 監査イベント（Enterprise） | 利用量は ChatGPT 管理画面（詳細監査は未確認） | セッション統計・週次ダイジェスト | なし |
| RBAC | トークン認証のみ（RBAC は将来） | SCIM・ロール・ポリシー（Enterprise） | ワークスペース/組織ポリシー（未確認詳細） | ロール/ネームスペース | なし |
| AI 機能自体 | 提供しない（Claude/Codex に委譲） | Claude モデル・アプリ | Codex モデル | 知識検索・セッション振り返り | 生成のみ（AI 実行は各エージェント） |
| セキュリティ強制 | dry-run 既定・バックアップ・シンボリックリンク検証・fail-closed・CSP | サンドボックス・許可/拒否 MCP・フック制御 | サンドボックス（CLI 側） | フック（例: 秘密スキャン） | strict プリセットでテスト/削除制限 |
| 費用 | 無償（MIT）、インフラは既存 1 ノード | Teams $150/席・月〜、Enterprise は見積 | ChatGPT Plus $20〜/月（利用上限）、Pro/Enterprise は上位 | 無償（MIT） | 無償（OSS） |
| 言語 | 日本語完全対応 | 英語中心（日本語 UI は未確認） | 英語中心 | 英語/中国語 | 英語 |

## 3. 加重代替率の算定

前提: 土木建設会社（600 名・IT/DX 7 名）が「AI コーディングエージェントの社内標準管理基盤」として本ツールを導入するケース。

| 重み | カテゴリ | 現在値（v0.3.0） | 改善後予測（v0.4.0） | 主な根拠 |
|---|---|---|---|---|
| 35% | 主要業務フロー | 60% | 85% | 環境診断→初期化→起動→テンプレート生成の一連フロー。v0.4.0 で `--profile` 実機能化・E2E スモーク追加 |
| 25% | 必須機能 | 70% | 88% | 要件定義 Must の実装率。起動・監査・CI/CD は揃う。RBAC・SSO は未実装のため 90% 未満 |
| 15% | UX | 50% | 72% | WebUI は CSP 準拠化・トークン保存改善。モバイル/ダークモードは未対応 |
| 10% | データ連携 | 40% | 55% | SSH（Windows）連携のみ。Entra ID / SharePoint / SIEM 連携は将来 |
| 10% | セキュリティ・監査 | 65% | 85% | fail-closed・symlink 対策・Origin 検証・CSP 改善で大幅向上。RBAC なし |
| 5% | 運用保守性 | 55% | 80% | 障害通知・Runbook・ロールバック整備。アラートの実績確認は今後 |
| **100%** | **合計** | **59%** | **81%** | 改善前後で +22pt |

### 80% 到達必須項目

1. 認証 fail-closed（✅ v0.4.0 実装済み・テスト済み）
2. symlink 対策（✅ 実装済み・テスト済み）
3. Codex 全権限モードの明示制御（✅ 実装済み）
4. WebSocket Origin 検証（✅ 実装済み）
5. E2E スモークテストの CI 常時実行（✅ 実装済み）
6. 障害通知（✅ 実装済み、Webhook 設定時のみ）

### 90% 到達項目（未実装）

- RBAC（管理者/開発者/参照のみ）
- Entra ID / OIDC SSO
- プロンプト実行内容・トークン利用量の監査（メタデータ以上）
- SIEM / メトリクス連携（Prometheus exporter 等）
- REST API の公開契約（OpenAPI）と CI 連携
- モバイル / PWA

### 意図的に代替しない機能

- AI モデル自体・コーディングエージェントの中身（Claude Code / Codex に委譲）
- 汎用知識ベース・セッション振り返り（teamai 系の領域。ロードマップ Phase 3 で検討）
- クラウド管理コンソールや SCIM プロビジョニング（Entra ID 連携は 6〜12 か月で検討）

## 4. 独自優位性とギャップ

### 独自優位性

1. **日本語で完結した運用資産**（要件・設計・Runbook・ADR）と 7 名体制向けの保守性
2. **WebUI + PTY + 監査ログ + systemd まで含む**オールインワン（競合 CLI 群に WebUI/監視/監査はほぼ無い）
3. **fail-closed / シンボリックリンク検証 / CSP 等、開発基盤としての安全設計**がテストで担保
4. 既存環境（Windows Server・M365・FortiGate 等）と併用可能な低コスト導入（無償・Node 1 プロセス）
5. 実 CLI 無しでも回帰を検知するスタブ E2E と、マルチ OS CI（ShellCheck/PSScriptAnalyzer/Bats/Pester/Node）

### ギャップ（競合が先んじている領域）

- Claude Code Enterprise: SSO/SCIM・サーバー管理設定・コンプライアンス API（監査の深度と権限管理）
- teamai-cli: スキル/ルール配布の git ネイティブ同期・知識ベース・ロール管理
- codi: 単一定義から 6 エージェントへの設定生成とドリフト検知
- OpenAI Codex: ChatGPT プラン一体の利用量・予算管理

## 5. 情報源

- Claude Code Admin Setup: https://code.claude.com/docs/en/admin-setup （2026-07-27 更新）
- Claude Enterprise overview: https://code.claude.com/docs/en/third-party-integrations （2026-07-14 更新）
- OpenAI Codex: https://github.com/openai/codex （Apache-2.0、2026-08 時点）
- teamai-cli: https://github.com/Tencent/teamai-cli （MIT、2026-08-03 更新）
- codi: https://github.com/lehidalgo/codi （2026-03-21 更新）
- Claude Code 価格（報道・二次情報として参照）: Teams $150/席・月（Premium）など。Enterprise 価格は公式サイトにて要見積（未確認のため断定しない）
