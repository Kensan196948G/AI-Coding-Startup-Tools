# クイックスタート

## 1. 前提

- Git 2.43 以上
- Node.js 20 以上（推奨）
- Bash 5.1 以上（Linux）/ PowerShell 7.4 以上（Windows）
- Claude Code または Codex（任意。未導入でも診断は可能）

## 2. 環境診断

Linux:

```bash
./scripts/linux/diagnose.sh
```

Windows:

```powershell
./scripts/windows/Test-Environment.ps1
```

結果は `[OK]` / `[WARN]` / `[NG]` で表示されます。`[NG]` がある場合は理由と対処を確認してください。

## 3. 初期化

はじめに必ずプレビューを実行します。

Linux:

```bash
./scripts/linux/bootstrap.sh --dry-run
```

Windows:

```powershell
./scripts/windows/Bootstrap.ps1
```

内容を確認したら適用します。

Linux:

```bash
./scripts/linux/bootstrap.sh --apply --yes
```

Windows:

```powershell
./scripts/windows/Bootstrap.ps1 -Apply -Yes
```

これでプロジェクトに `.ai-startup-tools/` が作成され、設定とプロファイルが配置されます。

## 4. AI ツールの起動

Claude Code:

```bash
./claude-code/linux/launch.sh
```

```powershell
./claude-code/windows/Start-ClaudeCode.ps1
```

Codex:

```bash
./codex/linux/launch.sh
```

```powershell
./codex/windows/Start-Codex.ps1
```

## 5. 開発文書の生成

```bash
./scripts/linux/render-template.sh --template templates/requirements \
  --set PROJECT_NAME=サンプル --set PROJECT_SLUG=sample
```

```powershell
./scripts/windows/New-ProjectFromTemplate.ps1 -Template templates\requirements \
  -Set PROJECT_NAME=sample,PROJECT_SLUG=sample
```

## 6. トラブル時

[トラブルシューティング](../troubleshooting/README.md) を参照してください。
