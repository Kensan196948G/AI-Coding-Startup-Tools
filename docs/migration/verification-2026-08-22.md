# DeepSeek移行 検証証跡（2026-08-22）

## 合格

| 検証 | 結果 |
|---|---|
| `npm test` | 68 / 68 合格 |
| `npm run test:sandbox` | 15 / 15 合格 |
| `npm run validate` | 設定、DeepSeek-only、Prompt、移行台帳、Secret scan 合格 |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `shellcheck` | 新Linux shell script合格 |
| `bats tests/bats` | 4 / 4 合格 |
| `node --check` | WebUI server／client合格 |
| `git diff --check` | 合格 |
| 実ブラウザ | LAN Token、Project選択、Git status／branch表示、console error 0件 |

PR CIではShellCheck/Bats jobだけが失敗した。Bats内の起動前検証が使用するNode依存とbubblewrapを同jobで導入していないことが原因であり、`actions/setup-node`、`npm ci`、bubblewrap導入を追加して修復した。最終CI結果はPRのRequired Checksを正本とする。

## 実環境ゲート

2026-08-22のLinux host実測は次のとおりで、Repositoryが要求する固定版とは一致していない。

| 対象 | Host実測 | 要求 | 状態 |
|---|---|---|---|
| OpenCode | `1.18.20` | `1.18.21` | 導入承認待ち |
| `oh-my-opencode` | `2.13.2` | `4.19.4` | 導入承認待ち |
| bubblewrap | available | required | 合格 |
| `DEEPSEEK_API_KEY` | unset | 実API Smoke時に必要 | Secret登録待ち |

固定版導入は `scripts/linux/bootstrap.sh --apply --yes`、版と境界だけの非Secret確認は `scripts/linux/launch.sh --check` で行う。Secret値は文書、引数、ログ、commitへ保存しない。

## 未検証

- 実DeepSeek APIを使うOpenCode／全Agent Smoke Test
- ブラウザのモバイル実寸目視（responsive CSSは実装済みだが、検証ブラウザのviewport overrideが反映されなかった）
- GitHub Required Checks、merge、Repository rename、Root Folder rename後の最終Smoke Test
- systemd適用、本番配置、SMB実mountの性能・運用確認
