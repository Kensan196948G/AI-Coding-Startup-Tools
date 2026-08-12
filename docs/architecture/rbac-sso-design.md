# RBAC / Entra ID SSO 設計（Phase 2）

> 作成日: 2026-08-12
> 状態: 設計（実装は Phase 2、Issue #13 / #14）
> 関連 ADR: [ADR-0003](../adr/0003-rbac-sso.md)

## 1. 目的

WebUI（AI Coding Startup Tools）に権限分離と既存 IdP（Entra ID）統合を導入し、
「誰が・どの操作を・いつ行ったか」を監査可能にする。

## 2. ロール定義

| ロール | 想定ユーザー | できること | できないこと |
|---|---|---|---|
| admin | IT/DX 管理者 | 全 API・セッション・設定参照・テンプレート生成・監査ログ参照 | — |
| developer | IT/DX 開発者 | プロジェクト一覧・診断・初期化・起動・テンプレート生成 | 監査ログ参照・設定変更（現状設定変更 API は無し） |
| read-only | 経営層・協力会社（将来） | プロジェクト一覧・状態表示・利用統計（将来） | セッション起動・テンプレート生成・監査ログ参照 |

## 3. 権限マトリクス（API グループ × ロール）

| API グループ | admin | developer | read-only |
|---|---:|---:|---:|
| `GET /api/health*` | ✅ | ✅ | ✅ |
| `GET /api/linux/projects` / Windows 一覧 | ✅ | ✅ | ✅ |
| `POST /api/linux/diagnose` / `bootstrap` | ✅ | ✅ | ❌ |
| `POST /api/templates/*` | ✅ | ✅ | ❌ |
| `POST /api/session`（PTY 起動） | ✅ | ✅ | ❌ |
| `GET /api/audit/*`（将来） | ✅ | ❌ | ❌ |
| `GET /api/metrics/*`（将来） | ✅ | ✅ | ✅（集計のみ） |
| ロール変更・SSO 設定（将来の管理 API） | ✅ | ❌ | ❌ |

判定は各ルートの**最小必要ロール**を宣言し、共通ミドルウェアで検証する。
該当しない操作は 403 + 監査ログ記録。

## 4. 認証フロー（Entra ID OIDC）

```text
ブラウザ ─ GET /api/auth/login (state+nonce+PKCE verifier 生成)
        ──► Entra ID 認証画面
        ◄── redirect_uri=/api/auth/callback?code=...&state=...
        ── POST token_endpoint (code+verifier, client_secret はサーバー側)
        ── JWKS 検証 (kid 一致・alg 許容・exp)
        ── id_token / userinfo から sub, email, groups 取得
        ── groups → role マッピング
        ── HttpOnly Secure SameSite=Lax Cookie (session id) + CSRF cookie
```

- PKCE: S256、verifier はセッション開始時に生成し 10 分で失効
- state / nonce: 不一致はログイン拒否（CSRF・リプレイ対策）
- JWKS: キャッシュ（既定 1 時間）・HTTPS 必須・alg は RS256 のみ許容
- グループ要求: `groups` 要求の追加と、超過時の `Microsoft Graph` 取得
  （`/groups` 取得は Phase B 以降の任意項目）

## 5. セッション管理

| 項目 | 仕様 |
|---|---|
| 保存先 | メモリ Map（単一ノード前提）。複数ノード化時は Neon / Redis へ移行 |
| 有効期限 | 24 時間（WebUI の既存セッション期限と整合）・アイドル 8 時間で失効 |
| Cookie | `HttpOnly; Secure; SameSite=Lax` + CSRF トークン（`X-CSRF-Token` ヘッダー検証） |
| ログアウト | `/api/auth/logout` でサーバー側セッション破棄 |
| 強制失効 | 管理者によるセッション一覧・削除 API（将来） |
| WebSocket | 既存 Host / Origin 検証に加え、Cookie セッションで認可。接続時 1 回の認可チェック |

## 6. 既存トークン認証の移行

1. 移行期: `x-auth-token` は admin として受け付け（既存互換）
2. OIDC 有効化後も `AI_WEBUI_TOKEN` はフェイルセーフ用に維持可能
3. 移行完了（全利用者が SSO 化）後に `AI_WEBUI_TOKEN` を無効化する設定を追加
4. 無効化後はトークンなしでは 401（fail-closed の維持）

## 7. 監査

- 監査ログ項目の拡張: `user(sub)`, `role`, `operation`, `result(200/403)`, `sessionId`
- 権限拒否（403）は必ず記録（権限逸脱の早期検知）
- ロール変更・グループ変更の反映はセッション更新時に監査

## 8. 実装計画

| フェーズ | 内容 | 依存 | 完了基準 |
|---|---|---|---|
| A | 権限ミドルウェア + ロール判定 + 既存トークンを admin 化 | なし | 権限マトリクスの統合テスト（200/403） |
| B | Entra ID OIDC ログイン（PKCE）・セッション Cookie・CSRF | A | 検証テナントでのログイン E2E |
| C | グループ→ロールマッピング・強制失効・監査拡張 | B | グループ変更の反映テスト・監査ログ確認 |
| D | トークン無効化設定・移行ガイド・利用者向け手順 | C | 移行完了後の fail-closed 確認 |

## 9. テスト計画

- 単体: 権限マトリクス全組み合わせ（role × route）、PKCE verifier 生成・state 検証
- 統合: 各ロールでの 200 / 403、CSRF 欠落 403、Cookie 失効 401
- E2E: 検証 Entra テナント（テストユーザー）でのログイン → 操作 → ログアウト
- セキュリティ: JWKS 偽装・alg 混同（RS256 以外拒否）・リプレイ（state/nonce 再使用拒否）

## 10. 未決定事項（実装時に確定）

- セッションストア: メモリのままか、Neon PostgreSQL に移行するか
- 協力会社ロール（view-only）の追加タイミング
- HENNGE ONE との連携（Entra 経由で十分か、個別連携が必要か）
- 監査ログの内容記録（Issue #15）との関係

## 11. セキュリティ考慮

- プロンプトインジェクション: ログイン・権限判定には LLM を使用しない（ルールのみ）
- 秘密値: client_secret は環境ファイル（mode 600）・Git 不保存（既存ポリシー）
- レート制限・タイミングセーフ比較は既存実装を維持
