# ADR-0003: RBAC と Entra ID SSO の採用

日付: 2026-08-12
状態: 採択（設計着手済み、実装は Phase 2 / Issues #13 #14）

## 背景

WebUI の認証は単一トークン（`x-auth-token`）のみで、全操作に等しく有効。
従業員 600 名規模・公共工事中心のガバナンス要求に対し、権限分離（RBAC）と
既存 IdP（Entra ID）との統合（SSO）が必要と判断した。

## 決定

1. **ロールは 3 段階**（admin / developer / read-only）を最小構成とする。
   必要に応じ「協力会社（view-only）」を追加できる設計にする。
2. **認証は Entra ID（OIDC Authorization Code + PKCE）を本命**とし、
   既存の `x-auth-token` は移行期間のみ維持する（互換として admin 扱い）。
3. **ロールは Entra グループからマッピング**する（設定ファイルで
   `group → role` を定義）。
4. **依存は Node 標準機能を基本**とする（JWKS 取得・検証は `fetch` +
   WebCrypto を使用。追加パッケージは最小限に留め、必要なら監査済みの
   OIDC 検証ライブラリ 1 本まで）。
5. セッションは HttpOnly Cookie + CSRF トークンで管理し、
   WebSocket は既存の Host / Origin 検証と Cookie を併用する。

## 影響

- `webui/server.mjs` の認証・ルーティングを権限ミドルウェアへ分割
- フロントエンドのログイン画面・ロール表示・操作可否制御
- 監査ログにユーザー・ロール・操作・結果を追加
- 設定ファイルに OIDC パラメータとグループマッピングを追加

## 代替案（不採用）

| 案 | 理由 |
|---|---|
| 自前ユーザー管理（ID/パスワード） | 既存 IdP と二重管理になり退職者無効化が遅れる |
| API キーをロール別に複数発行 | 運用は単純だが、ユーザー特定・失効管理・SSO 要件を満たさない |
| HENNGE ONE を直接 IdP にする | 現状 Entra ID が既存環境の中心であり、OIDC フローは Entra 経由で対応可能。HENNGE 連携は Phase 3 以降に検討 |

## リスク

- OIDC 実装の複雑さ（PKCE・状態検証・JWKS キャッシュ・グループ要求）
- セッション保存先（現状メモリ。複数ノード化する場合は Neon 等の共有ストアが必要）
- ロール誤設定による権限逸脱 → 権限マトリクスの統合テストで防ぐ

## 参照

- 詳細設計: `docs/architecture/rbac-sso-design.md`
- Issue: #13（RBAC）/ #14（Entra ID SSO）
- 評価: `docs/evaluation/reassessment-v0.4.0.md`（Phase 2）
