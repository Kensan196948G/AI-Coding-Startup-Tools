# テスト証跡（v0.4.0 改善検証）

> 実行日: 2026-08-12
> 環境: Linux（GitHub Actions と同等の Ubuntu 系）/ Node.js v25.2.1 / PowerShell 7.6.4 / Claude Code 2.1.228 / Codex CLI 0.139.0
> 対象: ブランチ `improve/production-hardening-v0.4.0` の作業ツリー

## 1. 実行コマンドと結果

| # | コマンド | 結果 | 備考 |
|---|---|---|---|
| 1 | `npm test` | **88 pass / 0 fail / 0 skip** | 単体 + 統合テスト（WebUI・WebSocket・PTY・パス検証・バージョン整合） |
| 2 | `npm run validate` | 全 OK | config（5）/ prompts（6）/ migration（8）/ secrets（検出なし） |
| 3 | `bats tests/bats/` | **29 pass / 0 fail** | E2E・セキュリティ・パス・プロンプト・バージョン。実 CLI 存在時は実 CLI で実行 |
| 4 | `shellcheck -x scripts/linux/*.sh scripts/linux/lib/*.sh claude-code/linux/*.sh codex/linux/*.sh` | CLEAN | CI と同一スコープ |
| 5 | `bash -n ...`（同スコープ） | CLEAN | 構文チェック |
| 6 | PSScriptAnalyzer（`scripts/windows` / `claude-code/windows` / `codex/windows`、Severity Error） | CLEAN | CI と同一条件 |
| 7 | `Invoke-Pester -Path tests/pester -Output Detailed -CI` | **10 pass / 0 fail / 2 skip** | skip は環境依存（Linux でジャンクション作成不可、claude 導入済みのため未導入時テストを回避） |
| 8 | `npm audit --audit-level=high` | **0 vulnerabilities** | 依存関係の既知脆弱性なし |
| 9 | HTTP スモーク（下記） | 全 OK | 実サーバー起動による確認 |

## 2. Node テスト内訳（88 件）

- `tests/unit/`: redact（秘密値マスキング）、render-prompt（変数解決）、pathguard、projects（symlink 対策含む）、websocket（RFC 6455 フレーム・ping/pong・close）
- `tests/integration/`: webui（認証・fail-closed・CSP・Origin/Host 検証・セッション・PTY・レート制限・静的配信）、pty-relay、validators、version-consistency（app.js 参照・インラインスクリプト禁止）

主要な新規・更新テスト:

| テスト | 確認内容 |
|---|---|
| `IT-WEBUI-CFG-002/003/004` | 非ループバック + トークン未設定は起動拒否 / トークン設定時は起動可 / ループバックはトークンなし可 |
| `IT-WEBUI-CFG-005` | Windows SSH ホスト・ユーザーの不正値を起動時拒否 |
| `IT-WEBUI-SEC-001` | 全レスポンスのセキュリティヘッダー + CSP に `script-src 'unsafe-inline'` が無いこと |
| WebSocket Host / Origin テスト | 不正 Host ヘッダー 403 / Host と異なる Origin 403 |
| `buildSessionSpec` テスト | Codex 既定で YOLO なし、`AI_WEBUI_ALLOW_DANGEROUS=1` 時のみ付与（Linux / Windows） |
| `GET /app.js` テスト | 外部 JS が `text/javascript` で配信される |
| `version-consistency` テスト | app.js のバージョン一致、インライン script / onclick / oninput / onkeydown ゼロ |
| `projects.test.mjs` | symlink 経由のルート外を拒否、ルート自身が symlink でも実体で判定 |

## 3. Bats テスト内訳（29 件）

- `launch-smoke.bats`: claude / codex の `--check` 起動前検査、存在しないプロファイル exit 2、safe プロファイルのプロンプト解決、install-check
- `notify-failure.bats`: Webhook 未設定時は何も送らない、設定時は JSON ペイロードを送信
- `diagnose.bats` / `path-safety.bats` / `prompt-check.bats` / `select-project.bats` / `version.bats`: 既存スイート（シンボリックリンク出力拒否、SSH メタ文字拒否、プロンプト変数検証、プロジェクト選択、バージョン整合）

補足: 本検証環境には実 CLI（Claude Code 2.1.228 / Codex CLI 0.139.0）が導入済みのため、`launch-smoke.bats` は**スタブではなく実 CLI で実行**された。CI 上で実 CLI が無い場合はスタブに切り替わって同じ分岐を検証する。

## 4. HTTP スモーク結果（実機）

```text
fail-closed: OK (AI_WEBUI_HOST でローカルループバック以外 (LAN/0.0.0.0) を指定する場合は
  AI_WEBUI_TOKEN の設定が必須です (認証 fail-closed))
GET /: 200 | CSP script-src 'self' + unsafe-inline なし: OK
GET /app.js: 200, content-type: text/javascript; charset=utf-8
GET /api/healthz: 200
GET /api/health (no token): 401
GET /api/health (token): 200, windowsUser 非公開: OK
```

## 5. 制約・未実施事項（推測しない範囲の明記）

- ~~実 CLI での AI 実行 E2E~~ → **2026-08-12 に検証環境で実施済み**（下記 6 参照）
- Windows 実機での Pester（ジャンクション対策テスト）は未実施。CI（windows-latest）で検証する。
- 負荷テスト（同時接続上限 16、レート制限 120/分の実測）は未実施。上限値のテストロジックは既存テストでカバー。
- ~~障害通知の systemd `OnFailure` 実地試験~~ → **2026-08-12 に実地確認済み**（下記 6 参照）
- Cloudflare Pages / 本番デプロイ先でのスモークは未実施。

## 6. 検証環境デプロイ実地スモーク（2026-08-12）

systemd（案 A）で検証デプロイを実施し、以下を実機確認した。

| 項目 | 結果 |
|---|---|
| 検証ユニット配置・起動 | `ai-coding-startup-tools-webui-verify.service` active、`/api/healthz` 200 |
| HTTP スモーク | `/` 200・CSP `script-src 'self'`・`/api/health` トークンなし 401 / あり 200・`/api/linux/projects` 200・`windowsUser` 非公開・監査ログにトークンなし |
| fail-closed 実地 | `AI_WEBUI_HOST=0.0.0.0` + トークン未設定で **exit code 2**（起動拒否） |
| 障害通知 OnFailure 実地 | 失敗ユニット → `notify-verify@` → ローカル Webhook へ JSON ペイロード送信を確認（service / host / timestamp / level / logs） |
| 実 AI セッション E2E | WebUI WebSocket（PTY）→ Claude Code（Fable 5）でタスク実行。`output.txt` に `ai-session-smoke` を書き込み、**exit code 0** で正常終了。監査ログに session 記録を確認 |

### 実地で発見し修正した問題（v0.4.1 反映）

1. **seccomp 許可リスト型フィルタが AI CLI を強制終了**: `SystemCallFilter=@system-service @network-io @file-system` + `~@privileged @resources ...` では Claude Code TUI が SIGSYS（exit 159）で終了。`SystemCallFilter=~@privileged @mount @swap @reboot`（危険グループのみ拒否）で解決。
2. **CLI 状態ディレクトリの書込み不可**: `ProtectHome=read-only` + `ProtectSystem=strict` のため `~/.claude/session-env` 作成が EROFS で失敗。`ReadWritePaths` に `~/.claude` / `~/.codex` を追加して解決。
3. **リソース上限不足**: `TasksMax=64` / `MemoryMax=512M` では Claude Code のスレッド生成（`uv_thread_t`）が失敗。実証済み値 `TasksMax=256` / `MemoryMax=1G` に引き上げ。

これらの修正は `deploy/ai-coding-startup-tools-webui.service`・導入ガイド・Runbook・CHANGELOG（Unreleased）に反映済み。

---

*証跡の生ログは実行環境のターミナル出力として保存済み。本ファイルは検証日時・コマンド・結果の要約である。*
