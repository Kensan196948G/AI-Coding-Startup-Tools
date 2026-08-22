# DeepSeek-Coding-Tools 移行記録

| 項目 | 内容 |
|---|---|
| 開始日 | 2026-08-22 |
| 変更元 | `AI-Coding-Startup-Tools` |
| 変更先 | `DeepSeek-Coding-Tools` |
| 正本仕様 | ルートのDeepSeek要件・詳細設計・変更仕様 |
| 現在状態 | 移行中 |

## 1. 判断

単純なRepository／Folder renameではなく、Claude Code／Codex依存を廃止してOpenCode＋Oh My OpenAgent＋DeepSeek-onlyへ再構築する。旧ランタイムの即時削除は行わず、代替経路、Sandbox拒否試験、WebUI／PTY／Git／監査の回帰試験が成功した後に撤去する。

Oh My OpenAgentは現行上流名、`oh-my-opencode`はnpmパッケージ名である。旧称「Oh My OpenCode」は入力仕様との追跡に限って保持する。

## 2. 再利用対象

| 資産 | 判断 | 必要な検証 |
|---|---|---|
| WebUI | 再利用 | OpenCode Session、画面状態、認証、CSP、Host／Origin |
| PTY | 再利用 | command allowlist、Workspace固定、終了処理、機密入力非記録 |
| Git処理 | 再利用 | main保護、dirty保護、Secret scan、PR gate |
| path検証 | 強化して再利用 | canonical path、symlink、別Project、SMB mount |
| 監査ログ | 拡張して再利用 | Provider／Model／Agent／Sandbox違反、Secret masking |
| Prompt／Template | 選別して再利用 | Claude／Codex固有記述除去、schema、承認gate |
| CI／Security policy | 強化して再利用 | Provider実効値、Sandbox負試験、Compatibility Matrix |

## 3. 廃止候補

`claude-code/`、`codex/`、`prompts/claude-code/`、`prompts/codex/`、`CLAUDE.md`を廃止候補とする。詳細とGateは [archive-map.md](./archive-map.md) を参照する。文書作成時点では削除していない。

## 4. 状態スナップショット

| 項目 | 状態 | 根拠／次のGate |
|---|---|---|
| 新文書3点 | 実装済み | ルートに追加 |
| README／Security／Contributing／Changelog | 実装済み | 移行中表示へ更新 |
| OpenCode Adapter | 設計段階 | G1 |
| DeepSeek-only検証 | 設計段階 | G1 |
| Oh My OpenAgent全Agent固定 | 設計段階 | G1 |
| Local／SMB Workspace | 設計段階 | G2 |
| 多層Sandbox | 設計段階 | G2 |
| WebUI／PTY／Git／Audit切替 | 設計段階 | G3 |
| 旧資産撤去 | 未決 | G4 |
| GitHub／Folder rename | 未決 | G5-G6 |

## 5. 人の承認を要する境界

- `main`へのmerge、Repository rename、branch削除
- GitHub Project／Ruleset／Secret等の外部設定変更
- systemd、専用OS user、filesystem permission、SMB mount、Network policy
- 本番deploy、DNS／Access、課金または外部送信
- 旧資産の破壊的削除

## 6. 完了証跡

完了時は使用版、実Model ID、Main／SubAgentの実効Provider、Sandbox拒否試験、通常test、secret scan、CI、PR、merge SHA、旧→新URL、最終Folder、Smoke Test結果を本書へ追記する。証跡がない項目は完了扱いにしない。
