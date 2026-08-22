# セキュリティ方針

## 1. 基本方針

DeepSeek Coding Toolsは「Workspace内部では高い自律性、Workspace外部では強い技術的境界」を採用します。プロンプトやAIの遵守だけをセキュリティ境界にせず、Workspace Validator、OpenCode Permission、Linux filesystem permission、namespace／bubblewrap等、Network／Secret policyを重ねます。

移行中のため、設計段階の制御を実装済みとみなしません。Sandbox Security Testに合格するまで、機密または本番WorkspaceでAutonomous modeを使用しないでください。

## 2. サポートと報告

セキュリティ問題は公開Issueへ秘密情報を投稿せず、メンテナーへ非公開で報告してください。

| 深刻度 | 対応目標 |
|---|---|
| Critical | 24時間以内にトリアージし、封じ込めを優先 |
| High | 3営業日以内にトリアージ |
| Medium／Low | 通常のリリースサイクルで対応 |

報告には影響版、OS、再現条件、想定境界、実際の結果を含めます。API Key、Token、Cookie、秘密鍵、実データは含めません。

## 3. Provider境界

- 許可ProviderはDeepSeekだけです。
- Anthropic、OpenAI、Google／Gemini、GitHub Copilot、xAI、Z.ai、Moonshot／Kimi、MiniMax、OpenRouterその他をDeepSeek-only modeで許可しません。
- Main Agentだけでなく全SubAgent、category、fallbackの実効Provider／Modelを検査します。
- DeepSeekが利用不能でも他Providerへfallbackせず、Sessionを停止します。
- Oh My OpenAgent（npm `oh-my-opencode`）更新時はAgentとモデル解決を再検証します。

## 4. Workspace境界

- サーバー側allowlistからLocal／SMB Rootを選び、`realpath`で1 Projectへ固定します。
- `..`、symlink escape、別Project、`/`、`/home`等の広域Rootを拒否します。
- SMBは管理者が事前mountし、AI Sessionにmount／umount権限を与えません。
- `read`、`edit`、`shell`、`subagent`、`skill`、`external_directory`をProfileとOS境界で制御します。
- TOCTOUやwrapper回避を考慮し、アプリケーションの文字列判定だけに依存しません。

## 5. 禁止事項

- API Key、Token、Cookie、SMB password、SSH private key、Cloudflare／Neon credentials、実値入り `.env` の表示・保存・commit
- `curl | sh`、`wget | bash`、`Invoke-Expression`による取得コードの直接実行
- TLS検証の無効化、資格情報のCLI引数渡し
- `sudo`、`su`、mount、partition／filesystem操作、user／service／firewall変更
- 無承認の再帰削除、本番deploy、外部送信、課金操作、GitHub設定変更
- `main`への直接push、自動merge、Required Checksの回避
- Sandbox拒否を単に警告へ格下げする変更

## 6. Secret制御

`.env`、`.env.*`、`*.pem`、`*.key`、`id_rsa`、`id_ed25519`、`credentials*`、`secrets*`を最低限の拒否patternとします。API Keyは環境変数またはOS Secret Storeから渡し、監査ログには存在確認とmask済み情報だけを記録します。プロンプト全文とPTYの機密入力は原則保存しません。

## 7. WebUI・監査

既存WebUIのloopback既定、非loopback時token必須、Host／Origin検証、CSP、rate limit、監査ログを維持します。LAN公開、systemd、Secret登録は別途承認と実機検証が必要です。

監査対象はSession ID、User、Workspace、Storage、開始・終了、OpenCode／Oh My OpenAgent版、DeepSeek論理モデル、Git branch／SHA、Sandbox Profile、違反、PR番号です。Secret値やPTY入力は対象外です。

## 8. 必須Security Test

- `../`、symlink、別Local／SMB Projectへの逸脱
- `/etc` write、`/root`、`~/.ssh`へのアクセス
- `.env`、秘密鍵のread／ログ／Git staging
- `sudo`、mount、mkfs、system変更
- 非DeepSeek Provider、未割当SubAgent、暗黙fallback
- WebUI認証、Host／Origin、WebSocket／PTY境界

拒否試験では「失敗した」だけでなく、期待したPolicy層がdenyし、境界外に副作用がないことを確認します。

## 9. リリース停止条件

Provider混在、Sandbox escape、Secret露出、Required Checks失敗、未検証の旧ランタイム撤去、High以上の未解決脆弱性がある場合はmerge／release／renameを停止します。
