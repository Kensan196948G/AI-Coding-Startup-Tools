# DeepSeek Coding Tools

OpenCodeをコーディングエンジン、Oh My OpenAgentをAgent Orchestration層、DeepSeekを唯一のAI Providerとして使用し、選択したLocal／SMB Workspace内部に実行権限を限定するSandbox型AIコーディング基盤です。

> ソース移行とローカル検証は完了しています。GitHub Repository名とルートフォルダ名は、PR・Required Checks・merge後に変更します。実DeepSeek APIを使うSmoke Test、Secret登録、systemd適用は運用承認境界です。

## 文書

- [要件定義書](./DeepSeek-Coding-Tools_要件定義書.md)
- [詳細設計仕様書](./DeepSeek-Coding-Tools_詳細設計仕様書.md)
- [変更仕様書](./DeepSeek-Coding-Tools_変更仕様書.md)
- [移行記録](./docs/migration/README.md)
- [セキュリティ方針](./SECURITY.md)

旧要件・設計文書は移行証跡として一時保持しています。新規実装の正本は上記DeepSeek文書です。

## 構成

```text
WebUI / CLI
    │
Workspace Manager ─ Local / mounted SMB
    │
Sandbox Manager
    │
OpenCode
    │
Oh My OpenAgent (npm: oh-my-opencode)
    │
DeepSeek only
```

添付仕様で使用された「Oh My OpenCode」は旧称です。現行上流名は **Oh My OpenAgent**、npmパッケージ名は **`oh-my-opencode`** です。

## 実装状態

| 領域 | 状態 | 説明 |
|---|---|---|
| WebUI、PTY、パス検証、Git、安全ポリシー、監査基盤 | 実装済み | 新OpenCode経路へ接続し回帰試験済み |
| 新要件・詳細設計・変更仕様・移行台帳 | 実装済み | 2026-08-22の移行仕様を文書化 |
| OpenCode Adapter | 実装済み | `opencode-ai@1.18.21`を固定しSchema／意味検証済み |
| Oh My OpenAgent統合 | 実装済み | `oh-my-opencode@4.19.4`固定、全AgentのDeepSeek割当を検査 |
| DeepSeek-only | 実装済み | 他Provider、未割当Agent、fallbackをfail-closedで拒否 |
| Local／SMB Workspace Manager | 実装済み | canonical path、既存mount、別Project拒否を実装・試験済み |
| 多層Sandbox | 実装済み | OpenCode Permission、bubblewrap、Network／Secret／Command policy |
| GitHub／Root Folder rename | 実施待ち | merge後に承認済み手順で実施 |
| 旧ランタイム資産撤去 | 実装済み | 代替経路と68件の全回帰試験合格後に撤去 |

## 最重要セキュリティ原則

- Workspace内部だけに自律的なread／edit／shell／subagentを許可する。
- Workspace外、別Project、`/etc`、`/root`、他ユーザーHOMEへのアクセスはfail-closedで拒否する。
- パス文字列だけでなく `realpath`、symlink、mount point、OS Sandboxを検証する。
- DeepSeek以外のProviderやfallbackが有効ならSessionを開始しない。
- `.env`、API Key、Token、Cookie、秘密鍵を表示・ログ記録・commitしない。
- `sudo`、mount、system変更、破壊的コマンドをAI Sessionから許可しない。
- main直接push、自動merge、本番deploy、Secret変更、外部送信は中央Policyと人の承認境界に従う。

詳細は [SECURITY.md](./SECURITY.md) を参照してください。

## Workspace

推奨例です。SMBは管理者がLinuxへ事前mountし、OpenCode Sessionにはmount権限を与えません。

```text
/srv/deepseek-workspaces/Project-A
/mnt/deepseek-smb/Project-B
```

選択後は1 ProjectだけをSessionのWorkspace Rootとして固定します。`/`、`/home`、許可Root全体、別ProjectをWorkspaceとして扱いません。

## 論理モデル

| 論理名 | 用途 |
|---|---|
| `deepseek-pro` | Main Agent、設計、計画、Deep Debug、Security／Code Review |
| `deepseek-flash` | 探索、検索、軽微な修正、テスト・文書生成、Librarian／Explore |

実Model IDはコードへ固定せず、検証済みProvider設定でマッピングします。無効なModelや非DeepSeek fallbackは停止条件です。

## 開発モード

- Safe: 探索中心。編集とpushに確認を要求
- Development: Workspace内編集、test／build、commitを許可
- Autonomous: Workspace内で分析からPRまで自動化。ただし外部承認境界は維持
- Deep Debug: 最大8 Round、停滞・同一試行の上限を設ける

どのモードでもSandbox境界を解除しません。

## 開発・移行への参加

[CONTRIBUTING.md](./CONTRIBUTING.md) と [移行チェックリスト](./docs/migration/phase-checklist.md) を確認してください。互換版、実Model ID、OS Sandbox方式の決定は設定・ADR・検証で追跡します。

## ライセンス

[MIT License](./LICENSE) で提供します。
