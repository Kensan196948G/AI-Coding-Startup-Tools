# DeepSeek-Coding-Tools 変更仕様書

| 項目 | 内容 |
|---|---|
| 変更元 | `AI-Coding-Startup-Tools` |
| 変更後 | `DeepSeek-Coding-Tools` |
| GitHub正本（移行後） | `Kensan196948G/DeepSeek-Coding-Tools` |
| 文書版 | 1.0 |
| 作成日 | 2026-08-22 |

## 1. 変更概要

本変更は、Claude Code／Codex向け汎用起動ツールを、OpenCode＋Oh My OpenAgent（npm `oh-my-opencode`）＋DeepSeek-onlyで構成するWorkspace限定Sandboxへ転換する。旧称「Oh My OpenCode」は添付仕様との対応名であり、現行上流名をOh My OpenAgentとして扱う。

## 2. 状態別変更一覧

| 区分 | 変更 | 状態 |
|---|---|---|
| 文書 | 新名称の要件・設計・変更仕様を追加 | 実装済み |
| 文書 | README／SECURITY／CONTRIBUTING／CHANGELOG／移行記録を更新 | 実装済み |
| 名称 | GitHub Repositoryをrename | 未決（merge後の承認操作） |
| 名称 | Root Folderをrename | 未決（Repository rename後） |
| Engine | 旧ランタイムからOpenCodeへ切替 | 実装済み |
| Agent | Oh My OpenAgentを統合し全AgentをDeepSeekへ固定 | 実装済み |
| Provider | DeepSeek以外とfallbackをfail-closedで拒否 | 実装済み |
| Workspace | Local／mounted SMBのProjectを1つ選択・固定 | 実装済み |
| Sandbox | 多層境界、command／secret／network policyを追加 | 実装済み |
| WebUI | Projects、Coding、Agents、Git、Sandbox中心へ再編 | 実装済み |
| 旧資産 | 旧実行ランタイム資産を撤去 | 実装済み（回帰試験合格） |

## 3. 名称変更

```text
Kensan196948G/AI-Coding-Startup-Tools
  → Kensan196948G/DeepSeek-Coding-Tools

AI-Coding-Startup-Tools/
  → DeepSeek-Coding-Tools/
```

正本URLは `https://github.com/Kensan196948G/DeepSeek-Coding-Tools`、clone URLは `https://github.com/Kensan196948G/DeepSeek-Coding-Tools.git` とする。rename完了前はこれらを「現在利用可能」と表示しない。

## 4. 追加・再構成

- `opencode/`: mode Profile、template、validation
- `oh-my-opencode/`: Agent／category／DeepSeek-only Profile
- `deepseek/`: Provider、論理Model map、validation
- `workspace/`: Local／SMB選択とcanonical path検証
- `sandbox/`: filesystem、command、secret、network policy
- `tests/sandbox/`、`tests/security/`: 境界拒否試験
- WebUI／PTY／Git／監査: 新Session Orchestratorへ接続

## 5. 廃止結果と検証条件

旧実行ランタイムと専用Promptは、次の条件を満たした後に撤去した。名称を含む履歴資料は `docs/migration/` に隔離して保持する。

1. OpenCodeの同等起動経路が動作する。
2. WebUI／PTY／Git／監査が新経路で試験済みである。
3. DeepSeek-onlyとSandbox拒否試験が合格する。
4. 旧パス参照を検索し、必要な再利用資産を移植する。
5. `docs/migration/`へ代替先と検証証跡を記録する。

## 6. 変更しないもの

- GitHubをコード正本とする原則
- main直接push禁止、Required Checks、レビュー、中央GitHub Policy
- Secretを記録・commitしない原則
- loopback既定と非loopback公開時の認証必須
- 既存ユーザー変更を保護し、無断上書き・破壊的削除をしない原則
- MIT License

## 7. 実施順序

1. baselineと既存変更を保護
2. 文書と移行台帳を作成
3. OpenCode／Agent／DeepSeek設定・検証を実装
4. Workspace Manager／Sandboxを実装
5. WebUI／PTY／Git／監査を切替
6. 通常・Security・Sandbox・Smoke Testを実施
7. 旧Claude／Codex資産を別差分で撤去し再検証
8. branch push、PR、Required Checks、承認済みmerge
9. GitHub Repository renameとorigin更新
10. Root Folder renameと最終Smoke Test

## 8. 影響範囲

| 対象 | 影響 |
|---|---|
| 利用者 | 起動CLI、画面、設定、Provider資格情報が変わる |
| 管理者 | Workspace Root、SMB mount、専用OS user、Egress管理が増える |
| CI | Provider／Agent実効値、Sandbox、Secretの検査が増える |
| 運用 | 互換性Matrix、監査、拒否試験の維持が必要になる |
| GitHub | Repository URL、clone、badge、文書リンクの更新が必要になる |

## 9. ロールバック

Repository rename前は移行branchを破棄せず旧mainを正本として維持する。merge後は承認済みタグ／SHAへ戻す。Repository rename後はGitHubのredirectだけに依存せずoriginと文書を整合させる。旧ランタイム削除は代替検証後の独立commitとし、問題時に復元可能にする。

## 10. 完了判定

完了は文書追加や名称表示だけでは判定しない。要件定義書の受入条件、詳細設計のGate G0～G6、Required Checks、最終Smoke Testの全成功を必要とする。未決項目が残る間は「移行中」と表示する。
