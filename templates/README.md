# 開発文書テンプレート

要件定義・設計・レビュー・リリースの 4 分類の雛形を提供します。各ディレクトリに `manifest.yml` と `template.md` が含まれます。

| 分類 | ディレクトリ | 代表成果物 |
|---|---|---|
| 要件定義 | `templates/requirements/` | `{{PROJECT_SLUG}}_要件定義書.md` |
| 設計 | `templates/design/` | `{{PROJECT_SLUG}}_詳細設計書.md` |
| レビュー | `templates/review/` | `{{PROJECT_SLUG}}_レビュー票.md` |
| リリース | `templates/release/` | `{{PROJECT_SLUG}}_リリース計画.md` |

## 生成方法

Linux:

```bash
./scripts/linux/render-template.sh \
  --template templates/requirements \
  --project-dir . \
  --set PROJECT_NAME="サンプルプロジェクト" \
  --set PROJECT_SLUG=sample-app
```

Windows:

```powershell
./scripts/windows/New-ProjectFromTemplate.ps1 `
  -Template templates\requirements `
  -Set PROJECT_NAME=sample,PROJECT_SLUG=sample-app
```

生成は既定で dry-run（プレビュー）です。適用には `--apply` / `-Apply` を指定してください。
