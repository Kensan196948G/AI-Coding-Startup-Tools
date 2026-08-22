# アーキテクチャ

```text
WebUI / CLI
    ↓
Workspace Validator (Local / mounted SMB)
    ↓
bubblewrap + OpenCode permission
    ↓
OpenCode 1.18.21
    ↓
oh-my-opencode 4.19.4
    ↓
DeepSeek only (pro / flash)
```

Provider allowlist、全Agent明示割当、fallback無効化、Workspace realpath固定を独立検証し、いずれかが不正ならSessionを開始しません。Linux filesystem権限と専用OSユーザーはリポジトリ外の管理者責務です。
