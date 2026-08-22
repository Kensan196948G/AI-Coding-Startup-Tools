# Linux導入

対象はUbuntu 24.04、Node.js 22、Bun 1.3、Git 2.43以上です。`bubblewrap`と専用ユーザー`deepseek-code`、Local/SMB Rootは管理者が事前準備します。

```bash
./scripts/linux/bootstrap.sh --dry-run
./scripts/linux/bootstrap.sh --apply --yes
npm ci
npm run validate
npm test
npm run test:sandbox
```

systemd例は `deploy/deepseek-coding-tools-webui.service` です。リポジトリから自動配置・起動はしません。
