# 移行フェーズ チェックリスト

> 前半は旧7リポジトリ統合の履歴、後半は2026-08-22に開始したDeepSeek専用基盤への移行です。チェック済み項目を新アーキテクチャの実装完了と読み替えないでください。

要件定義書「11. 移行計画」の各フェーズを進めるためのチェックリストです。

## Phase 0: 統合元の凍結・バックアップ・棚卸し

- [x] 7 リポジトリの既定ブランチとコミット SHA を固定する
- [x] 各リポジトリをローカルへクローン（読み取り専用）
- [x] バックアップ（リモート/ローカル）を作成する（クローンを /tmp に保持、GitHub 側が正本）
- [x] 棚卸しツールでエントリを生成する（全 7 リポジトリで生成済み）

```bash
node scripts/migration/build-inventory.mjs \
  --repo-dir ../Claude-StartUpTools-New-Linux \
  --source-repository Claude-StartUpTools-New-Linux \
  --out docs/migration/inventory.new.yml
```

- [x] 生成結果をレビューし、`docs/migration/inventory.yml` へマージする（追跡対象エントリのみ。未レビューの自動生成分はマージせず再生成可能）

## Phase 1: 共通資産の抽出と重複比較

- [ ] 同一ファイル名・類似ファイルの SHA-256 を比較する
- [ ] 重複・競合・秘密情報・旧仕様を検出し、[conflict-report.md](./conflict-report.md) に記録する
- [x] 各資産の採否（merge / unify / platform-specific / tool-specific / obsolete / sensitive / unresolved）を決定する（追跡対象エントリ）
- [x] `inventory.yml` の `decision` と `status` を更新する

> 2026-08-05 時点: 7 リポジトリすべて入手済み。起動エントリ 4 件は `unify / verified`、設定 1 件は `unresolved`、
> 旧想定パス 3 件は `obsolete / rejected` に更新済み。自動生成 2,600 件超の個別採否レビューは残作業として管理。

## Phase 2: Claude Code 資産の統合

- [ ] 採用した資産を `claude-code/` 配下へ配置する
- [x] 代表シナリオ（起動前検査・dry-run・起動）を Linux / Windows で実行する
- [ ] Bats / Pester テストを追加または更新する
- [ ] 受入試験に合格した資産の `status` を `verified` にする

> Linux の `launch.sh --check` は 2026-08-05 に PASS。Windows の `Start-ClaudeCode.ps1 -Check` は PowerShell 7 で PASS
> （Windows ネイティブ実行は CI の Pester で担保）。

## Phase 3: Codex 資産の統合

- [ ] Phase 2 と同様の手順を `codex/` 配下で実施する
- [x] 代表シナリオを Linux / Windows で実行する
- [x] テストと台帳を更新する

> Linux の `launch.sh --check` は 2026-08-05 に PASS。Windows の `Start-Codex.ps1 -Check` は PowerShell 7 で PASS。

## Phase 4: 文書・プロンプト・テンプレートの統合

- [ ] 要件定義・設計・レビュー・リリースの 4 テンプレートを確認する
- [ ] プロンプトの Front Matter（スキーマ・変数・承認ゲート）を検証する
- [ ] `npm run validate` が合格することを確認する

## Phase 5: CI・セキュリティ・受入試験

- [ ] 必須 CI がすべて合格する
- [ ] 秘密情報スキャン・依存関係検査に合格する
- [ ] Must 要件の受入基準を満たす

## Phase 6: v1.0 公開・利用者移行

- [ ] CHANGELOG・互換性表を更新する
- [ ] SemVer タグと GitHub Release を作成する
- [ ] クイックスタートで再現できることを確認する

## Phase 7: 統合元のアーカイブ判定

- [ ] 残課題・参照先・ロールバック方法を [archive-map.md](./archive-map.md) に記録する
- [ ] メンテナー承認を得る
- [ ] 承認後にのみ、統合元を read-only アーカイブへ移す

---

## DeepSeek Gate G0: Baseline保護

- [x] 添付変更仕様を正本として新要件・設計・変更仕様を作成する
- [x] 旧文書を移行証跡へ隔離し、旧実行資産は検証完了まで保持する
- [x] 現行branch、dirty差分、remote、SHA、既存test結果を確認する
- [ ] Repositoryの完全バックアップと復元手順を確認する

## DeepSeek Gate G1: Engine／Provider／Agent

- [x] 検証済みOpenCode版を固定し、Compatibility Matrixを更新する
- [x] Oh My OpenAgent（npm `oh-my-opencode`）の検証済み版を固定する
- [x] `deepseek-pro`／`deepseek-flash`を有効な実Model IDへmappingする
- [x] Main Agentと有効な全SubAgentをDeepSeekへ明示割当する
- [x] 非DeepSeek Provider、未知Agent、暗黙fallbackの拒否試験を追加する

## DeepSeek Gate G2: Workspace／Sandbox

- [x] Local／SMB RootとProject選択を実装する
- [x] realpath、`..`、symlink、別Project、禁止Rootを検証する
- [x] SMB mount pointの同一性を検証する
- [x] OpenCode Permissionとbubblewrap OS Sandboxを構成する
- [x] command、secret、network policyを実装する
- [x] 全Sandbox拒否試験に合格する

## DeepSeek Gate G3: WebUI／PTY／Git／Audit切替

- [ ] Session起動をWorkspace→Sandbox→Provider→OpenCode→Agent→Gitの順にする
- [x] WebUIとPTYをOpenCode Sessionへ接続する
- [x] Git status／diff／commit／push／PRの承認境界を実装し負試験する
- [ ] 監査ログへ版、論理Model、Workspace、Policy違反を追加する
- [ ] 通常test、security、secret scan、E2E、Smoke Testに合格する

## DeepSeek Gate G4: 旧資産撤去

- [x] `archive-map.md`の各代替先と検証証跡を確認する
- [ ] 旧名称・旧path参照を検索し、履歴以外から除去する
- [x] 旧実行ランタイムとtool固有Promptを撤去する
- [x] 撤去後に全回帰試験を再実行する（68件合格）

## DeepSeek Gate G5-G6: Renameと最終確認

- [ ] branch push、PR、Required Checks、レビューを完了する
- [ ] 承認された方式でmergeする
- [ ] GitHub Repositoryを `DeepSeek-Coding-Tools` へrenameし、originを更新する
- [ ] Root Folderを `DeepSeek-Coding-Tools` へrenameする
- [ ] clone、文書link、WebUI、OpenCode Session、Sandboxを最終Smoke Testする

Repository rename、folder rename、merge、Secret、systemd、本番配置は、未決の外部操作として個別の承認境界を維持します。
