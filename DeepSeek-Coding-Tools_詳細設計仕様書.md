# DeepSeek-Coding-Tools 詳細設計仕様書

| 項目 | 内容 |
|---|---|
| 文書版 | 1.0 |
| 基準日 | 2026-08-22 |
| 対応要件 | `DeepSeek-Coding-Tools_要件定義書.md` |
| 実装状態 | 移行中。設計を含み、受入試験前の機能を実装済みとは扱わない |

## 1. 設計原則

1. Workspace境界をプロンプトだけに依存しない。
2. Provider、Agent、権限は設定値だけでなく実効値を検査する。
3. 安全条件が一つでも不明ならSessionを開始しない。
4. Sandbox境界はSafe／Development／Autonomous／Deep Debugで共通とする。
5. 旧経路は代替経路の試験合格まで保持し、切替と削除を分離する。

## 2. 論理アーキテクチャ

```text
WebUI / CLI
    │
Session Orchestrator
    ├─ Workspace Manager ─ Local / mounted SMB
    ├─ Policy Engine ─ Filesystem / Command / Secret / Network
    ├─ Provider Validator ─ DeepSeek-only
    ├─ Agent Profile Validator ─ Oh My OpenAgent
    ├─ OpenCode Adapter
    ├─ Git Adapter
    └─ Audit Logger
             │
       Linux OS boundary
             │
          DeepSeek API
```

名称対応は次のとおりとする。

| 表示名 | 技術上の識別子 | 備考 |
|---|---|---|
| Oh My OpenAgent | npm `oh-my-opencode` | 現行上流名とパッケージ名が異なる |
| Oh My OpenCode | 旧称 | 移行履歴・添付仕様との対応に限定 |
| `oh-my-opencode/` | リポジトリ内設定ディレクトリ候補 | npm識別子に合わせる。上流ブランドを指す |

## 3. 物理構成

以下は目標構成であり、未作成のパスは「設計段階」である。

```text
DeepSeek-Coding-Tools/
├── opencode/{profiles,templates,validation}/
├── oh-my-opencode/{agents,profiles,categories}/
├── deepseek/{provider,models,profiles,validation}/
├── sandbox/{policies,linux,validation}/
├── workspace/{manager,local,smb,validation}/
├── scripts/{linux,validation}/
├── webui/{server,public,lib}/
├── common/{config,policies,schemas,audit}/
├── tests/{unit,integration,sandbox,security,fixtures}/
└── docs/{architecture,guides,migration,adr,troubleshooting}/
```

`webui/`、`common/`、`scripts/`、`tests/` を新経路へ再構成した。旧実行ランタイムと専用Promptは、代替実装、境界試験、回帰試験の合格後に撤去し、履歴資料だけを `docs/migration/` に保持する。

## 4. 設定責務

| 設定 | 配置 | 責務 | 状態 |
|---|---|---|---|
| システム既定 | `common/config/` | 許可Root、版、監査等 | 既存資産あり／新Schemaは設計段階 |
| OpenCode Profile | `opencode/profiles/` | mode別Permission | 設計段階 |
| Agent Profile | `oh-my-opencode/` | Agent、tools、model割当 | 設計段階 |
| Model map | `deepseek/models/` | 論理名→実Model ID | 設計段階 |
| Sandbox Policy | `sandbox/policies/` | filesystem／command／secret／network | 設計段階 |
| Project設定 | `<workspace>/.opencode/` | Project固有の許可設定 | 設計段階 |

優先順位は安全側の制約を弱めない形で `system policy > selected sandbox profile > project config > session request` とする。Project設定によるsystem denyの上書きを禁止する。

## 5. Session起動シーケンス

```text
1. User認証
2. Storage選択
3. Project選択
4. canonical path検証
5. mount／filesystem／secret／command policy検証
6. DeepSeek資格情報の存在確認（値は表示しない）
7. Provider allowlistと実効Model検証
8. OpenCode版・設定検証
9. Oh My OpenAgent版・全Agent割当検証
10. Git branch／dirty／remote確認
11. Auditへ開始イベント記録
12. OS Sandbox内でOpenCode Session起動
```

2～10のいずれかが失敗した場合、エラーコードと安全な対処だけを返し、子プロセスを生成しない。

## 6. Workspace Manager

### 6.1 入力

```json
{
  "storage": "local | smb",
  "project": "Project-A",
  "profile": "safe | development | autonomous | deep-debug"
}
```

クライアントから絶対パスを直接信用しない。サーバー側の許可Rootと列挙済みProjectから解決する。

### 6.2 検証アルゴリズム

1. storageに対応する許可Rootを設定から取得する。
2. Rootと候補Projectを `realpath` で解決する。
3. Root自体が `/`、`/home`、`/root`等の禁止Rootでないことを確認する。
4. 候補が `root + separator` で始まることを確認する。
5. 候補が存在するディレクトリであることを確認する。
6. SMBでは許可mount pointの配下であり、期待するfilesystem／mount sourceであることを確認する。
7. Session中は解決済みWorkspace Rootをimmutableとして保持する。

文字列prefixだけの検証は禁止する。ファイル操作時も親ディレクトリとsymlinkの解決結果を再確認し、TOCTOU対策としてOS Sandboxを併用する。

### 6.3 拒否コード

| コード | 条件 |
|---|---|
| `E_WS_STORAGE` | 未知のStorage |
| `E_WS_ROOT` | 禁止または未許可Root |
| `E_WS_ESCAPE` | `..`、symlink、別Projectへの逸脱 |
| `E_WS_NOT_FOUND` | Project不存在 |
| `E_WS_MOUNT` | SMB mount検証失敗 |

## 7. Provider・Model設計

```yaml
providerPolicy:
  allowed: [deepseek]
  fallback: deny
models:
  deepseek-pro: ${DEEPSEEK_PRO_MODEL_ID}
  deepseek-flash: ${DEEPSEEK_FLASH_MODEL_ID}
```

実Model IDは秘密ではないが、Providerの公開・廃止に追随できるよう環境別設定へ分離する。API Keyは環境変数名だけを参照し、設定ファイルへ値を書かない。

検証は次の3段階で行う。

1. 静的検査: Provider allowlist、fallback deny、論理モデルの欠落を検出。
2. 解決検査: OpenCodeとAgent拡張が返す実効Provider／Modelを列挙。
3. 実行検査: Main Agentと代表SubAgentの監査イベントがDeepSeekを示すことを確認。

非DeepSeek文字列が設定に存在するだけでなく、暗黙fallbackや未指定Agentも拒否対象とする。

## 8. Agent Profile設計

| 分類 | 既定論理モデル | Agent例 |
|---|---|---|
| High Reasoning | `deepseek-pro` | Sisyphus、Prometheus、Oracle、Metis、Momus、Atlas、Architecture、Security Review |
| Fast Worker | `deepseek-flash` | Explore、Librarian、Repository探索、軽微な文書生成 |

上流版から有効Agent一覧を取得し、「allowlistにあるAgentだけ」ではなく「有効な全AgentにDeepSeek割当がある」ことを検査する。未知Agentは自動でfallbackさせず `E_AGENT_UNMAPPED` とする。

## 9. Sandbox設計

### 9.1 防御層

| 層 | 制御 |
|---|---|
| 1 | Workspace Managerのcanonical path検証 |
| 2 | OpenCode Permission (`read`、`edit`、`shell`、`subagent`、`skill`、`external_directory`) |
| 3 | 専用Linux userとfilesystem permission |
| 4 | bubblewrap／namespace等によるmount・process境界 |
| 5 | Egress allowlistとSecret policy |

OSアカウントは例として `deepseek-code` を使用し、Workspaceだけを書込み可、Runtimeはread-only、`/etc`、`/root`、`/usr`、`/boot`、`/var`、他ユーザーHOMEへのwriteを禁止する。アカウント作成と権限変更は管理者作業であり自動実行しない。

### 9.2 Command Policy

| 種別 | 例 | 処理 |
|---|---|---|
| 通常開発 | `git status`、`npm test`、`pytest`、`go test`、`cargo test` | Profileによりallow |
| 外部変更 | `git push`、PR、package publish | 明示承認または中央Policy |
| system変更 | `sudo`、`su`、`mount`、`umount`、`systemctl`、`useradd` | deny |
| 破壊的 | `rm -rf /`、`mkfs`、`fdisk`、shutdown系 | deny |
| container | `docker` | 既定deny、専用Profileは未決 |

コマンド名だけでなくshell展開、absolute path、wrapper、interpreter経由を考慮し、OS境界を最終防御とする。

## 10. Secret・Network設計

Secret patternは `.env`、`.env.*`、`*.pem`、`*.key`、`id_rsa`、`id_ed25519`、`credentials*`、`secrets*` を最低限含む。read、edit、ログ、Git stagingの各境界で検査する。Secret値を検証ログへ出さず、存在・source・mask済みfingerprintだけを扱う。

Egressは既定denyを目標とし、DeepSeek API、GitHub、npm、PyPI、承認済み公式Repositoryを宛先単位で許可する。DNS、proxy、IPv6、直接IPを含む強制方式は実装選定後にADR化する。

## 11. WebUI・PTY設計

既存WebUIのloopback既定、非loopback時token必須、Host／Origin検証、rate limit、CSP、監査ログは再利用する。画面は次の責務へ再編する。

- Projects: Local／SMBとProject選択
- Coding: mode選択とSession起動
- Agents: 有効Agentと論理／実Model表示
- Terminal: PTY接続。入力全文は監査しない
- Git: status／diff／commit／push／PR。外部変更は承認境界を維持
- Sandbox: Workspace、filesystem、commands、network、secretsの実効状態

WebUIが表示する「許可」はサーバー側の実効検査結果に基づき、静的サンプルを実動作として表示しない。

## 12. Audit設計

```json
{
  "timestamp": "RFC3339",
  "event": "session.start | policy.deny | git.action | session.end",
  "sessionId": "opaque-id",
  "user": "local-user",
  "workspace": "masked-or-approved-path",
  "storage": "local | smb",
  "versions": {"opencode": "x", "ohMyOpenAgent": "y"},
  "logicalModel": "deepseek-pro",
  "git": {"branch": "x", "sha": "y"},
  "sandboxProfile": "development",
  "result": "allow | deny | error"
}
```

API Key、Authorization header、Cookie、プロンプト全文、PTY入力、Secret file内容は記録禁止フィールドとする。

## 13. Git設計

中央GitHub Policyを最優先とし、`main`直接pushと自動mergeを行わない。標準状態遷移は `branch → development → test → review → commit → push → PR → CI → human/authorized merge` とする。commit前にdirty差分、Secret、生成物、test evidenceを検査する。

## 14. テスト設計

| ID | 対象 | 期待結果 |
|---|---|---|
| UT-WS-001 | Local Workspace正規化 | 選択Projectに固定 |
| SEC-WS-001 | `../` escape | deny |
| SEC-WS-002 | symlink escape | deny |
| SEC-WS-003 | 別Local／SMB Project | deny |
| SEC-FS-001 | `/etc` write、`/root`、`~/.ssh` read | deny |
| SEC-SECRET-001 | `.env`、private key read | deny／mask |
| SEC-CMD-001 | `sudo`、mount、mkfs | deny |
| SEC-PROVIDER-001 | 非DeepSeek Provider設定 | 起動拒否 |
| SEC-AGENT-001 | 未指定SubAgent／fallback | 起動またはCI失敗 |
| IT-OC-001 | OpenCode Session | 選択Workspaceで起動 |
| IT-AG-001 | Main＋代表SubAgent | DeepSeek実効Modelを監査確認 |
| E2E-UI-001 | WebUI起動フロー | 検証順序、PTY、終了処理が正常 |
| E2E-GIT-001 | status→diff→commit→PR | Policyと承認境界を維持 |

Sandbox拒否試験は成功系と別suiteにし、「コマンドが失敗した」だけでなく期待したPolicy層がdenyしたことを確認する。

## 15. 移行・切替設計

| Gate | 内容 | 完了条件 |
|---|---|---|
| G0 | baseline保護 | dirty差分、SHA、remote、既存testを記録 |
| G1 | 新Adapter | OpenCode／DeepSeek／Agent静的検査合格 |
| G2 | Workspace／Sandbox | unitと全拒否試験合格 |
| G3 | WebUI／PTY／Git切替 | E2E合格、旧経路fallback不要 |
| G4 | 旧資産撤去 | 参照検索、回帰、移行台帳更新 |
| G5 | Repository rename | PR・Required Checks・merge完了後に人が承認実行 |
| G6 | Folder rename | origin更新後、最終Smoke Test合格 |

G4より前に旧ランタイムを削除しない。GitHub rename、push、merge、Secret、systemd、本番配置はそれぞれ承認境界に従う。

## 16. エラー形式

```text
[E_PROVIDER_DENIED] DeepSeek以外のProviderが有効です。
対象: 実効Provider設定
変更: 実施していません。
対処: 非DeepSeek設定を除去し、validationを再実行してください。
```

エラーはcode、対象、原因、変更有無、安全な対処を含む。Secretや未加工stack traceは利用者応答へ含めない。同一試行は無限反復しない。

## 17. 実装確定値と未決運用

- 実装確定: `deepseek-v4-pro`／`deepseek-v4-flash`、OpenCode `1.18.21`、`oh-my-opencode` `4.19.4`
- 実装確定: bubblewrapによるmount／PID／IPC／UTS／network namespace分離
- 未決運用: token上限、timeout、rate limit、proxyを使う場合のEgress規則
- SMB filesystem判定、mount options、性能基準
- Docker Profile、監査保持、RBAC、production systemd

未決運用項目は実装済みと表記せず、実環境の互換性試験またはADR承認後に本書を更新する。
