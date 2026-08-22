# 改善台帳（v0.4.0 本番運用強化）

> 更新日: 2026-08-12
> ベースライン: v0.3.1-dev（commit `19ec66c`、総合 75.2/100、代替率 59%）
> 対象ブランチ: `improve/production-hardening-v0.4.0`

## 1. 実装済み改善

| ID | 分類 | 内容 | 根拠・影響 | 実装ファイル | テスト証跡 | 状態 |
|---|---|---|---|---|---|---|
| IMP-001 | セキュリティ | 認証 fail-closed（非ループバック + トークン未設定は起動拒否） | 認証 fail-open が重大リスク。LAN 公開時の無認証アクセスを根絶 | `webui/server.mjs`（`loadConfig`） | `IT-WEBUI-CFG-002/003/004` + 実機スモーク | ✅ |
| IMP-002 | セキュリティ | symlink 解決ベースのパス検証（realpath） | `isInsideRoot` の文字列比較を迂回して任意ディレクトリを起動できた | `webui/lib/projects.mjs`（`canonicalizePath` / `resolveInsideRoot`） | `tests/unit/projects.test.mjs`（symlink バイパス拒否・リンクルート実体判定） | ✅ |
| IMP-003 | セキュリティ | Codex 全権限モードの明示制御（`AI_WEBUI_ALLOW_DANGEROUS`） | WebUI 経由の Codex が既定で YOLO になる blast radius を縮小 | `webui/server.mjs`（`buildSessionSpec`）、`webui/webui.env.example`、systemd ユニット、README | `buildSessionSpec` 既定無効 / 明示有効テスト（Linux / Windows） | ✅ |
| IMP-004 | セキュリティ | CSP `script-src 'self'` 化（インライン JS・イベントハンドラ撤廃） | XSS 発生時の緩和策を有効化。インライン `oninput` が根本原因だった | `webui/server.mjs`（SECURITY_HEADERS）、`webui/public/index.html`、新規 `webui/public/app.js` | `IT-WEBUI-SEC-001`、`version-consistency.test.mjs`、HTTP スモーク | ✅ |
| IMP-005 | セキュリティ | アクセストークン保存を `sessionStorage` へ変更 | localStorage の平文保持で XSS / マルウェア窃取リスクを低減（タブ終了で破棄） | `webui/public/app.js` | コードレビュー + `version-consistency.test.mjs` | ✅ |
| IMP-006 | セキュリティ | WebSocket Host / Origin 検証 | DNS リバインディング・CSWSH 対策。非ブラウザ接続はループバック限定 | `webui/server.mjs`（`checkUpgradeOrigin`） | `IT-WEBUI-WS`（不正 Host 403 / 不正 Origin 403） | ✅ |
| IMP-007 | 情報漏えい | `/api/health` から `windowsUser` 除外、SSH stderr を redact | 認証済みでも接続情報・エラー内の秘密値を返さない | `webui/server.mjs` | `/api/health` テスト + 実機スモーク、`UT-REDACT-*` | ✅ |
| IMP-008 | セキュリティ | Windows SSH ホスト・ユーザーの入力バリデーション | SSH コマンド組み立て前の不正値（`-oProxyCommand` 等）を起動時拒否 | `webui/server.mjs`（`loadConfig`） | `IT-WEBUI-CFG-005` | ✅ |
| IMP-009 | 運用 | systemd OnFailure 障害通知（Webhook） | 死活監視の異常を自動通知。未設定時は無害 | `deploy/ai-coding-startup-tools-notify@.service`、`scripts/linux/notify-failure.sh` | `OPS-NOTIFY-001`（未設定時）/ `OPS-NOTIFY-002`（ペイロード送信） | ✅ |
| IMP-010 | 機能 | `--profile` オプション実機能化（Linux / Windows 4 ランチャー） | 宣言のみだったプロファイル選択を実装。存在検証 + 既定プロンプト解決 | `claude-code/linux/launch.sh`、`codex/linux/launch.sh`、`claude-code/windows/Start-ClaudeCode.ps1`、`codex/windows/Start-Codex.ps1` | `E2E-LAUNCH-003`（存在しないプロファイル exit 2）/ `E2E-LAUNCH-004`（safe プロファイル解決） | ✅ |
| IMP-011 | 運用 | Bootstrap.ps1 の部分失敗対応（終了コード 10） | bash 版にあった partial failure 処理を Windows に実装。失敗時に復元を促す | `scripts/windows/Bootstrap.ps1` | Pester スイート（Apply・冪等性）全 pass | ✅ |
| IMP-012 | 信頼性 | 監査ログ gzip エラー処理、WebSocket アップグレード try/catch | 圧縮失敗でローテーションが壊れる・例外でプロセスが落ちる可能性を除去 | `webui/server.mjs` | コードレビュー（正常系は既存テスト） | ✅ |
| IMP-013 | 機能 | `/app.js`・`/index.html` の静的配信ルート追加 | CSP 準拠の外部 JS 配信を正式対応 | `webui/server.mjs` | `GET /app.js` テスト + 実機スモーク | ✅ |
| IMP-014 | テスト | Bats CLI スモーク（スタブ + 実 CLI 併用） | CI の E2E skip 問題を解消し、起動スクリプト回帰を常時検知 | `tests/bats/launch-smoke.bats`、`tests/bats/notify-failure.bats` | Bats 29 件全合格（本環境は実 CLI 2.1.228 / 0.139.0） | ✅ |
| IMP-015 | 品質 | バージョン整合（package.json / package-lock.json / WebUI） | 0.3.0 → 0.4.0 へ統一。lockfile の 0.1.0 残存を解消 | `package.json`、`package-lock.json` | `IT-VERSION-*`、Bats `UT-VERSION` | ✅ |
| IMP-016 | 文書 | README / CHANGELOG / 導入ガイド / Runbook / env.example 更新 | 新セキュリティ制約・障害通知・運用手順を正本へ反映 | `README.md`、`CHANGELOG.md`、`webui/README.md`、`docs/guides/production-deployment.md`、`docs/operations/runbook.md`、`webui/webui.env.example` | 文書レビュー + 設定検証 | ✅ |
| IMP-017 | 評価 | 競合・代替率分析の新規作成 | 5 製品の一次情報比較、加重代替率 59% → 81% を算定 | `docs/evaluation/competitive-analysis.md` | — | ✅ |

## 2. 監査・検証の実施内容

- セキュリティ監査: `docs/evaluation/security-review-v0.4.0.md`
- テスト証跡: `docs/evaluation/test-evidence.md`
- 再評価・ロードマップ: `docs/evaluation/reassessment-v0.4.0.md`
- 競合分析: `docs/evaluation/competitive-analysis.md`

## 3. 未実施・次フェーズ項目

| ID | 内容 | 重要度 | 予定 |
|---|---|---|---|
| TODO-001 | RBAC（管理者 / 開発者 / 参照のみ） | 高 | Phase 2 |
| TODO-002 | Entra ID / OIDC SSO 連携 | 高 | Phase 2 |
| TODO-003 | 監査ログへのプロンプト・応答内容記録（同意・暗号化・保持期限付き） | 中 | Phase 3（ポリシー決定後） |
| TODO-004 | 実 CLI での AI 実行セッション E2E（検証環境） | 中 | デプロイ後 1 件実施 |
| TODO-005 | 障害通知 OnFailure の実地試験 | 中 | 検証デプロイ後 |
| TODO-006 | Windows 実機でのジャンクション対策テスト | 中 | PR マージ後の CI |
| TODO-007 | 負荷・性能テスト（同時接続上限値での確認） | 中 | Phase 1 |
| TODO-008 | launch.sh / Start-*.ps1 の共通関数化（重複解消） | 低 | Phase 1 |
| TODO-009 | `createApp` / `handleUpgrade` の分割リファクタリング | 低 | Phase 1 |
| TODO-010 | コマンド履歴保存のオプトイン化 | 低 | Phase 1 |

---

*本台帳は 2026-08-12 時点の状態を記録する。*
