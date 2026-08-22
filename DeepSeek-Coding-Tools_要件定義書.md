# DeepSeek-Coding-Tools 要件定義書

| 項目 | 内容 |
|---|---|
| 正式名称 | DeepSeek Coding Tools |
| GitHub正本（移行後） | `Kensan196948G/DeepSeek-Coding-Tools` |
| ルートフォルダ（移行後） | `DeepSeek-Coding-Tools` |
| 主運用OS | Linux |
| コーディングエンジン | OpenCode |
| Agent拡張 | Oh My OpenAgent（npm: `oh-my-opencode`） |
| AI Provider | DeepSeekのみ |
| 対象ストレージ | ローカルディスク／Linuxに事前mountされたSMB |
| 文書版 | 1.0 |
| 基準日 | 2026-08-22 |

## 1. 文書の目的

本書は、旧 `AI-Coding-Startup-Tools` を、OpenCodeとDeepSeekに限定したSandbox型AI自律コーディング基盤へ移行するための要求を定義する。名称変更だけでなく、Claude Code／Codexランタイムを廃止し、指定Workspace内だけに高い自律性を許可する構成へ転換する。

### 1.1 状態の表記

| 状態 | 意味 |
|---|---|
| 実装済み | 現行ソースに実装があり、既存検証の対象である |
| 設計段階 | 本移行で実装・検証する目標仕様である |
| 未決 | 実測、互換性確認または人の承認が必要である |

2026-08-22時点で、WebUI、PTY、Git処理、パス検証、監査ログ、OpenCode起動、DeepSeek-only強制、Agent全体のモデル固定、多層Sandbox、Local／SMB選択はソース実装と自動試験が完了している。実API Smoke Test、GitHub／Folder rename、Secret登録、systemd適用は運用ゲートとして分離する。

## 2. システム定義

`DeepSeek-Coding-Tools` は、OpenCodeをコーディングエンジン、Oh My OpenAgentをAgent Orchestration層、DeepSeekを唯一のAI Providerとして採用し、ローカルまたはSMB上の選択Workspace内部に実行権限を限定する基盤である。

> Sandbox内部では高い自律性を与え、Sandbox外部には強い技術的境界を設ける。

## 3. 利用者と運用前提

| 対象 | 要求 |
|---|---|
| 開発者 | WebUIまたはCLIからWorkspaceとモードを選び、安全にAI開発を実行できる |
| 管理者 | 許可Root、SMB mount、Secret、互換版、監査保持を管理できる |
| レビュアー | Git差分、テスト、Sandbox違反、使用モデルを追跡できる |
| CI | 非DeepSeek Provider、境界逸脱、Secret混入、未検証変更を拒否できる |

Linuxを実行の正本とする。SMBは管理者が事前にmountし、AIセッションにmount／umount権限を与えない。

## 4. 機能要件

### 4.1 Workspace管理

| ID | 要件 | 状態 |
|---|---|---|
| FR-WS-001 | LocalまたはSMBを選択し、その配下の1 ProjectをWorkspace Rootとして固定する | 設計段階 |
| FR-WS-002 | `realpath`で正規化し、許可Root、存在、ディレクトリ種別を検査する | 一部実装済み／拡張は設計段階 |
| FR-WS-003 | `..`、symlink escape、別Project、`/`、`/home`等の広域Rootを拒否する | 一部実装済み／拡張は設計段階 |
| FR-WS-004 | SMB選択時はmount pointを検証し、選択Project以外を拒否する | 設計段階 |
| FR-WS-005 | 不正なWorkspaceではセッションを起動しない | 設計段階 |

推奨RootはLocalが `/srv/deepseek-workspaces/`、SMBが `/mnt/deepseek-smb/` とする。実配置は管理者設定で変更できるが、広すぎるRootは拒否する。

### 4.2 OpenCode実行

| ID | 要件 | 状態 |
|---|---|---|
| FR-OC-001 | 検証済みOpenCode版を使用し、Sessionを選択Workspaceで起動する | 設計段階 |
| FR-OC-002 | `read`、`edit`、`shell`、`subagent`、`skill`、`external_directory`をProfileごとに制御する | 設計段階 |
| FR-OC-003 | Workspace外のread／editと外部ディレクトリ権限をfail-closedで拒否する | 設計段階 |
| FR-OC-004 | OpenCode設定と実効設定の双方を起動前・CIで検証する | 設計段階 |

### 4.3 DeepSeek-only Provider

| ID | 要件 | 状態 |
|---|---|---|
| FR-DS-001 | DeepSeekだけを許可し、他Provider設定があれば起動を拒否する | 設計段階 |
| FR-DS-002 | APIの実Model IDをコードへ固定せず、論理名から設定で解決する | 設計段階 |
| FR-DS-003 | `deepseek-pro`を高推論、`deepseek-flash`を高速作業用論理モデルとする | 設計段階 |
| FR-DS-004 | Main Agent、SubAgent、fallbackの実効ProviderがすべてDeepSeekであることを検査する | 設計段階 |
| FR-DS-005 | DeepSeekへ到達不能またはModel IDが無効なら、他Providerへfallbackせず停止する | 設計段階 |

### 4.4 Agent Orchestration

上流プロジェクトの現行名称は **Oh My OpenAgent**、npmパッケージ名は **`oh-my-opencode`** である。本書中の旧称「Oh My OpenCode」は添付仕様との対応を示す歴史的名称としてのみ扱う。

| ID | 要件 | 状態 |
|---|---|---|
| FR-AG-001 | 利用する全AgentへDeepSeekモデルを明示割当する | 設計段階 |
| FR-AG-002 | Sisyphus、Prometheus、Oracle、Metis、Momus、Atlasは原則 `deepseek-pro` とする | 設計段階 |
| FR-AG-003 | Explore、Librarianは原則 `deepseek-flash` とする | 設計段階 |
| FR-AG-004 | 上流更新時にAgent名・設定Schema・モデル解決を互換性試験する | 設計段階 |
| FR-AG-005 | Agent未定義や非DeepSeek fallbackを検出した場合は起動・CIを失敗させる | 設計段階 |

上流Agent一覧は版により変化し得るため、列挙は固定保証ではない。実際に有効化されたAgent集合を機械検査する。

### 4.5 SandboxとShell

| ID | 要件 | 状態 |
|---|---|---|
| FR-SB-001 | Workspace Validator、OpenCode Permission、Linux権限、namespace／bubblewrap、Network／Secret policyの多層防御を用いる | 設計段階 |
| FR-SB-002 | `sudo`、`su`、`mount`、`umount`、`mkfs`、`fdisk`、shutdown系、system変更を拒否する | 設計段階 |
| FR-SB-003 | 通常の開発コマンドはProfileのallow-policyに従う | 設計段階 |
| FR-SB-004 | Dockerは明示Profileと追加境界がある場合だけ許可する | 未決 |
| FR-SB-005 | すべてのモードでSandbox境界を不変とする | 設計段階 |

### 4.6 Secret・Network・監査

| ID | 要件 | 状態 |
|---|---|---|
| FR-SEC-001 | `.env*`、秘密鍵、credentials、secrets等のread／edit／commitを制御する | 一部実装済み／拡張は設計段階 |
| FR-SEC-002 | `DEEPSEEK_API_KEY`等を環境変数またはOS Secret Storeから注入し、引数・ログへ出さない | 設計段階 |
| FR-NET-001 | EgressをDeepSeek API、GitHub、承認済みPackage Repositoryへ限定可能にする | 設計段階 |
| FR-AUD-001 | Session、User、Workspace、Storage、版、論理モデル、Git、Profile、違反、PRを記録する | 一部実装済み／拡張は設計段階 |
| FR-AUD-002 | プロンプト全文、API Key、PTYの機密入力は原則記録しない | 一部実装済み／拡張は設計段階 |

### 4.7 WebUI・CLI・Git

| ID | 要件 | 状態 |
|---|---|---|
| FR-UI-001 | Dashboard、Projects、Coding、Agents、Terminal、Git、Sandbox、History、Logs、Settingsを提供する | 既存基盤は実装済み／再構成は設計段階 |
| FR-UI-002 | Storage→Project→境界→Provider→OpenCode→Agent拡張→Gitの順に検査し、失敗時は起動しない | 設計段階 |
| FR-GIT-001 | status、diff、branch、commit、push、PRを支援する | 一部実装済み／統合は設計段階 |
| FR-GIT-002 | main直接push・自動mergeを禁止し、中央GitHub Policyを優先する | 実装・運用済み |
| FR-GIT-003 | mergeにはCI、security、Sandbox、secret scan、conflict確認を要求する | 設計段階 |

### 4.8 実行モード

| モード | 要求 | 状態 |
|---|---|---|
| Safe | 探索中心、編集・pushに確認を要求 | 設計段階 |
| Development | Workspace内編集、test／build、commitを許可 | 設計段階 |
| Autonomous | Workspace内で分析からPRまで自動化し、外部操作の承認境界を維持 | 設計段階 |
| Deep Debug | 最大8 Round、3 Round進展なしで戦略変更、同一試行最大3回 | 設計段階 |

## 5. 非機能要件

| 分類 | 要求 |
|---|---|
| Security | Workspace外writeを技術的に拒否し、設定不正時はfail-closedとする |
| Reliability | Provider、Agent、Workspace、Sandboxの検査に失敗したSessionを開始しない |
| Maintainability | OpenCode、Agent拡張、DeepSeek、Workspace、Sandboxを独立Adapter／Policyとして分離する |
| Portability | LinuxローカルとLinuxにmountされたSMBを扱う |
| Auditability | SessionからGit、モデル、Policy違反、PRまで追跡できる |
| Performance | 小ファイルが多いProjectではLocalまたはLocal開発＋SMB同期を推奨する |
| Usability | CLIとWebUIから主要フローを実行でき、状態と拒否理由を日本語で示す |

## 6. 構成・互換性要件

OpenCode、`oh-my-opencode`、Node.js、Bun、DeepSeek Provider Adapter、Linux Distribution、Gitの検証済み組合せをCompatibility Matrixで固定する。`latest`を本番運用の唯一の指定にしない。版番号は調査時点の候補をそのまま採用せず、npm／上流確認と互換性試験の成功後に確定する。

## 7. 移行要件

1. 旧資産と利用箇所を棚卸しする。
2. OpenCode Adapter、DeepSeek-only検証、Agent Profileを追加する。
3. Workspace Managerと多層Sandboxを追加する。
4. WebUI、PTY、Git、監査を新経路へ接続する。
5. 負試験と通常試験を完了する。
6. 代替確認後に旧Claude Code／Codexランタイム資産を別変更で撤去する。
7. Required Checks合格後にPRをmergeする。
8. 人の承認下でGitHub名とローカルフォルダ名を最後に変更する。

旧資産を移行前に削除しない。履歴文書と `docs/migration/` では旧名称を保持してよい。

## 8. 受入条件

- [ ] GitHub Repository名とRoot Folder名が `DeepSeek-Coding-Tools` である（merge後）
- [ ] OpenCodeとOh My OpenAgentが検証済み固定版で実API起動する
- [x] Main Agentと全SubAgentの設定がDeepSeekのみを使用する
- [x] 非DeepSeek Provider／fallbackを起動前とCIで拒否する
- [x] Local／SMBの選択Workspaceだけを操作できる
- [x] `..`、symlink、他Project、`/etc`、`/root`、`~/.ssh`への逸脱を拒否する
- [x] `.env`等のSecret read／ログ制御が機能する
- [x] `sudo`、mount、system変更を拒否する
- [x] WebUI、PTY、Git、監査ログが新経路へ接続され自動試験に合格する
- [ ] 通常テスト、Sandbox Security Test、secret scan、CI、実API Smoke Testが成功する
- [x] 旧実行ランタイム機能が代替確認後に廃止される
- [x] README、要件、設計、変更仕様、移行記録、CHANGELOGが一致する

## 9. 未決事項

- DeepSeek APIの性能・費用上限
- 実DeepSeek資格情報を使うSmoke Testの実施日時
- 対象Linux Distributionごとのbubblewrap互換性
- Docker Profileの要否
- SMBの認証、mount options、同期／バックアップ運用
- 監査ログの本番アクセス権
- GitHub rename、merge、Secret登録、systemd、本番配置の実行日時と承認者
