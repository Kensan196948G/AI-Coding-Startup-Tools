# DeepSeek Coding Tools WebUI

LocalまたはLinuxへ事前mount済みのSMBから単一Workspaceを選択し、Sandbox検証後にOpenCode PTY Sessionを開始します。

```bash
npm run webui
```

既定は `127.0.0.1:8080` です。非ループバックで待受ける場合、`DEEPSEEK_WEBUI_TOKEN` がなければ起動を拒否します。

## 主な画面

- Projects: Local / SMB Workspace選択
- Coding: Safe / Development / Autonomous / Deep Debug
- Agents: DeepSeek論理モデルの実効割当
- Terminal: OpenCode PTY
- Git: 選択Workspace限定の状態・差分・PR導線
- Sandbox: filesystem / commands / secrets / network境界
- History / Logs: Secretを含めない監査情報

設定例は [webui.env.example](./webui.env.example)、systemd unit例は [deepseek-coding-tools-webui.service](../deploy/deepseek-coding-tools-webui.service) を参照してください。unitは配置例であり、このリポジトリから自動適用しません。
