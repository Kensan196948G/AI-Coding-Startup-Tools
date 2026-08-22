# クイックスタート

```bash
git clone https://github.com/Kensan196948G/DeepSeek-Coding-Tools.git
cd DeepSeek-Coding-Tools
./scripts/linux/bootstrap.sh
./scripts/linux/diagnose.sh
```

管理者が `/srv/deepseek-workspaces/<project>` または `/mnt/deepseek-smb/<project>` を準備した後、次を実行します。

```bash
export DEEPSEEK_API_KEY='secret-storeから注入'
./scripts/linux/launch.sh --workspace /srv/deepseek-workspaces/<project> --profile safe
```

API Keyをファイル、引数、ログへ記録しないでください。
