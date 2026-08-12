# セキュリティ監査レビュー（v0.4.0）

> 監査日: 2026-08-12
> 対象: AI Coding Startup Tools v0.4.0（branch: `improve/production-hardening-v0.4.0`）
> 方法: ソースコードレビュー / 統合テスト（Node 88 件）/ Bats E2E（29 件）/ 実機 HTTP スモーク / ShellCheck・PSScriptAnalyzer / npm audit / 秘密情報スキャン

## 1. 監査の結論

**重大リスク 5 件はすべて修正済み・テスト済み**。追加で WebSocket の Host/Origin 検証、SSH エラー出力の redact、Windows 接続情報の入力検証、トークンの `sessionStorage` 保存などを実装した。

検証済みの残リスクは「RBAC / Entra ID SSO 未実装」「実 CLI での AI 実行 E2E 未実施」「監査ログにプロンプト・応答内容を記録しない」などで、いずれも明確に課題化している。**本番導入は「条件付き利用可」**（条件: トークン運用の徹底、LAN 公開時の設定確認、監査・運用手順の遵守）。

## 2. 重大問題 5 件の修正確認

| # | 旧リスク（v0.3.x） | 修正内容 | テスト証跡 | 状態 |
|---|---|---|---|---|
| 1 | 認証 fail-open: デフォルトでトークンなし。LAN 公開 + トークン忘れで全 API・セッション起動が無認証 | `loadConfig` で非ループバック待受（`0.0.0.0` / LAN IP / `::`）+ トークン未設定なら**起動を拒否**（exit 2） | `IT-WEBUI-CFG-002`（拒否）/ `IT-WEBUI-CFG-003`（トークン設定時は起動可）/ `IT-WEBUI-CFG-004`（ループバックはトークンなし可） | ✅ 修正済み |
| 2 | Codex を WebUI から起動すると常に YOLO（全権限）モード | `AI_WEBUI_ALLOW_DANGEROUS=1` のときだけ `--allow-dangerous` / `-Yolo` を付与。既定は無効 | `buildSessionSpec` の既定・明示有効化テスト（Linux / Windows 両方） | ✅ 修正済み |
| 3 | symlink 経由のルート検証バイパス（`~/projects/link → /etc` で任意ディレクトリ起動） | `canonicalizePath` / `resolveInsideRoot` を追加し、realpath 解決後にルート判定 | `tests/unit/projects.test.mjs`（symlink ルート外拒否・リンクルート実体判定） | ✅ 修正済み |
| 4 | E2E テストが CI で skip され回帰を検知できない | Bats スタブ + 実 CLI 併用のスモークテスト `tests/bats/launch-smoke.bats` を追加（CI 常時実行） | Bats 29 件全合格（本環境は実 CLI 2.1.228 / 0.139.0 で実行） | ✅ 修正済み |
| 5 | CSP `script-src 'unsafe-inline'` + インラインイベントハンドラ / localStorage 平文トークン | CSP から `'unsafe-inline'` 撤廃、JS を `webui/public/app.js` へ外部化、イベント委譲化、トークン保存を `sessionStorage` へ変更 | `IT-WEBUI-SEC-001`（CSP ヘッダー検証）/ `version-consistency.test.mjs`（インライン script・onclick/oninput/onkeydown ゼロ検証）/ HTTP スモーク | ✅ 修正済み |

## 3. 追加のセキュリティ強化（v0.4.0）

| 対策 | 実装 | 検証 |
|---|---|---|
| WebSocket アップグレード時の Host / Origin 検証 | `checkUpgradeOrigin`（DNS リバインディング / CSWSH 対策、非ブラウザ接続はループバック限定） | `IT-WEBUI-WS`（不正 Host 403 / 不正 Origin 403） |
| `/api/health` からの情報削減 | `windowsUser` をレスポンスから除外 | `GET /api/health` テスト + 実機スモーク |
| SSH エラー出力の秘密値マスキング | `redact()` を SSH stderr に適用 | `UT-REDACT-*` テスト |
| Windows SSH ホスト・ユーザーの入力検証 | 許可文字以外は `loadConfig` で起動拒否 | `IT-WEBUI-CFG-005` |
| 監査ログ gzip 失敗時の安全な後始末 | 出力・gzip ストリームのエラーハンドリング追加 | コードレビュー（正常系テストは既存） |
| WebSocket アップグレード処理の try/catch 保護 | `server.on("upgrade")` 全体を保護 | コードレビュー |
| 障害通知（任意） | systemd `OnFailure` → `notify-failure.sh`（Webhook 設定時のみ動作） | `OPS-NOTIFY-001/002` |
| 監査ログ・ローテーションの既存強化 | 日次ローテーション / gzip / 7 世代保持（v0.3.0 実装を維持） | 既存テスト |

## 4. 検証結果サマリ（2026-08-12 実行）

| 検証 | 結果 |
|---|---|
| `npm test`（Node 単体・統合） | 88 件 pass / 0 fail |
| `npm run validate`（config / prompts / migration / secrets） | 全 OK、秘密情報スキャン検出なし |
| `bats tests/bats/`（実 CLI + スタブ併用 E2E・セキュリティ） | 29 件 pass / 0 fail |
| ShellCheck / `bash -n` | CLEAN |
| PSScriptAnalyzer（Windows 3 ディレクトリ） | CLEAN |
| Pester | 10 pass / 0 fail / 2 skip（環境依存） |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| HTTP スモーク | `/` 200 + CSP `script-src 'self'`、`/app.js` 200、healthz 200、トークンなし `/api/health` 401、トークンあり 200 + `windowsUser` 非公開、`0.0.0.0` + トークン未設定は起動拒否 |

## 5. 残リスク（重要度順）

| # | 残リスク | 重要度 | 現状の緩和策 | 対応方針 |
|---|---|---|---|---|
| 1 | RBAC（管理者/開発者/参照）未実装。トークンは全操作に等しく有効 | **高** | トークンの厳格管理・LAN 公開時のみ使用・監査ログで操作追跡 | Phase 2 で実装（OIDC SSO と併せて） |
| 2 | Entra ID / OIDC SSO 未実装 | **高** | なし（トークン運用） | Phase 2 で実装 |
| 3 | 監査ログはメタデータのみでプロンプト・応答内容を記録しない | 中 | PTY 内容非記録はプライバシー設計として明記 | 利用ポリシーを定め、同意後は内容ログ（暗号化・保持期限付き）を追加検討 |
| 4 | 障害通知は Webhook 設定時のみ動作。実地（本番 systemd）未確認 | 中 | Bats でペイロード検証済み | 検証環境デプロイ後に OnFailure 実地試験 |
| 5 | Windows のジャンクション対策は CI（Windows 実機）で検証する必要あり | 中 | 文字列ベース検証 + 実装 | PR マージ後の CI で確認 |
| 6 | 実 CLI での AI 実行（トークン消費を伴う本番セッション）E2E は未実施 | 中 | `--check` の起動前検査は実 CLI で合格 | 検証環境で 1 セッションの実操作テストを実施 |
| 7 | コマンド履歴（実行コマンド文字列）が localStorage に残る | 低 | 秘密値は入力欄に置かず、トークンは sessionStorage のみ | 履歴保存オプトイン化または保持期限を追加 |
| 8 | `createApp` / `handleUpgrade` 等の巨大関数が残存 | 低 | 新規コードは分割・テスト付き | Phase 1 以降でリファクタリング |
| 9 | launch.sh / Start-*.ps1 の 4 ペア重複 | 低 | 各ペアに E2E テスト追加 | 共通関数化を課題として追跡 |
| 10 | Cloudflare Pages 等での外部公開は本評価では未検証 | 中 | トークン必須 + CSP + Origin 検証で緩和 | 検証デプロイ後にスモーク実施 |

## 6. セキュリティスコア

**72 / 100 → 90 / 100**（+18）

判定根拠: 重大 5 件の解消、WebSocket 攻撃面の封鎖、情報漏えい経路の削減、入力検証の追加、テスト・監査の自動化。未実装の RBAC / SSO と、実地（本番）での確認不足が満点を妨げている。

## 7. 結論と推奨事項

1. v0.4.0 を IT/DX 部門の開発インフラとして導入する前提は満たした。**ただし LAN 公開時は `AI_WEBUI_TOKEN` を必ず設定し、`AI_WEBUI_ALLOW_DANGEROUS=0` を維持すること**。
2. マージ後に GitHub Actions（Windows: PSScriptAnalyzer / Pester）の結果を確認する。
3. 検証環境へデプロイし、障害通知 OnFailure の実地試験と実 CLI セッション 1 件のスモークを実施する。
4. Phase 2 で RBAC / Entra ID SSO を最優先で実装する。
5. 秘密情報スキャンと `npm audit` は既存の週次ワークフロー（`.github/workflows/security.yml`）で継続する。

---

*本レビューは 2026-08-12 時点のコード・テスト結果に基づく。評価者: Codex（親エージェント）*
