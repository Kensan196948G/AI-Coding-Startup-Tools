# 運用Runbook

1. `scripts/linux/diagnose.sh`でruntimeとbubblewrapを確認する。
2. `npm run validate`でDeepSeek-onlyとexact pinを確認する。
3. `npm run test:sandbox`でdeny matrixを確認する。
4. WebUIは既定loopbackで起動し、LAN公開時だけtokenを設定する。
5. 監査ログにはSession ID、Workspace、profile、branch、結果を残し、API KeyやPTY入力は残さない。
6. Provider・Workspace・Secret・Sandbox検査の失敗時はSessionを開始しない。
