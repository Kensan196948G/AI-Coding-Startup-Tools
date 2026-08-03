# Claude Code 支援資産

Claude Code の起動・初期設定・プロンプトを一元管理するためのディレクトリです。

| パス | 内容 |
|---|---|
| `common/config.example.yml` | 設定の雛形 |
| `common/profiles/` | 起動プロファイル（safe 等） |
| `common/prompts/` | ツール固有プロンプトの置き場所 |
| `linux/install-check.sh` | Linux 用導入確認 |
| `linux/launch.sh` | Linux 用安全起動 |
| `windows/Install-Check.ps1` | Windows 用導入確認 |
| `windows/Start-ClaudeCode.ps1` | Windows 用安全起動 |

## 安全な起動

```bash
./claude-code/linux/launch.sh --check
./claude-code/linux/launch.sh
```

```powershell
./claude-code/windows/Start-ClaudeCode.ps1 -Check
./claude-code/windows/Start-ClaudeCode.ps1
```

危険なオプション（全権限・無確認実行）は明示指定がない限り有効化されません。詳細は [common/policies/safety.md](../common/policies/safety.md) を参照してください。
