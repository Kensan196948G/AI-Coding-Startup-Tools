# ADR-0002: 本番デプロイ対象の確定方法

日付: 2026-08-05
状態: 採択保留（利用者承認時に確定）

## 背景

本リポジトリ（開発者ツールキット + WebUI）の本番デプロイ先を調査した結果、
2026-08-05 時点で次の事実が判明した。

- Cloudflare Pages には既存プロジェクトが 3 件あるが、いずれも本リポジトリ用ではない
  （`obcda-web` / `dx-project-atlas` / `pimm-web`）。
- 本 Linux ホストには `ai-coding-startup-tools-webui.service` が未登録。
- ポート 8080 は別の Vite 開発サーバーが使用中。
- Neon 等の DB は本リポジトリでは使用しない（DB なし）。

## 決定（選択肢）

本番デプロイは、利用者の承認時に次のいずれかから確定する。

| 案 | 内容 | 適合度 |
|---|---|---|
| A: Linux ホストへ systemd 配置 | `deploy/ai-coding-startup-tools-webui.service` を配置し、`/etc/ai-coding-startup-tools/webui.env` から環境変数を読み込み WebUI を常時起動 | フル機能（診断・初期化・テンプレート・Windows SSH 操作）を提供できるため推奨 |
| B: Cloudflare Pages（静的プレビュー） | `webui/public/` を静的サイトとして公開。Node API / SSH / ファイル操作は実行できないためデモ表示（`/api` 未接続時のモック）のみ | UI 確認用の限定的プレビュー |
| C: GitHub Release 配布のみ | タグ + Release を作成し、利用者が各自で取得・展開 | ツールキット本来の配布方式 |

## 結果

- デプロイ対象は「対象 account / project / environment / domain を一意に特定できる」まで
  本番操作を行わない（AGENTS.md・CLAUDE.md の停止条件を遵守）。
- 承認時点で案 A を選ぶ場合は、作業ブランチにデプロイ計画（パス・ポート・トークン・
  検証コマンド・rollback）を明記した Approval PR または本 PR の追記で確定する。

## 代替案

- 新規 Cloudflare Pages プロジェクトの作成: フル機能を提供できないため、本ツールの
  本番としては不採用（静的デモ確認に限定する場合のみ利用可）。
- Workers での再実装: `child_process` / SSH / ファイル操作に制約があるため現実的でない。
