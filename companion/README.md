# DeepSeek Coding Companion

Windows 11／macOSの利用PCで動作し、`https://ai-coding.mirai-dx-platform.com` から次の操作だけを受け付けるローカル補助プロセスです。

- OS標準画面によるLocal／外付けHDDフォルダ選択
- Explorer／FinderによるSMB接続画面の表示
- 選択済みWorkspaceでのOpenCode `1.18.21` 起動
- DeepSeek APIキーの60秒・一回限りの受け渡し

Companionは `127.0.0.1:47831` だけで待受けます。LAN公開、任意コマンド実行、ブラウザからのraw path指定、SMBパスワード受領は行いません。

## 前提

- Windows 11またはmacOS
- Node.js 20以上
- `opencode-ai@1.18.21`
- `oh-my-opencode@4.19.4`

```bash
npm install -g opencode-ai@1.18.21 oh-my-opencode@4.19.4
opencode --version
```

## パッケージ作成

LinuxのプロジェクトRootで実行します。

```bash
npm run companion:pack
```

`dist/deepseek-coding-companion-1.0.0.tgz` が生成されます。

Node.jsを同梱した未署名のWindows/macOS実行ファイルは次で生成します。

```bash
npm run companion:build:native
```

- `dist/deepseek-coding-companion-windows-x64.exe`
- `dist/deepseek-coding-companion-macos-x64`
- `dist/deepseek-coding-companion-macos-arm64`

未署名バイナリは開発・実機検証専用です。正式配布前にWindowsコード署名とmacOSコード署名・notarizationを実施します。

## Windows 11へのインストール

PowerShellで、配布したtgzのあるフォルダから実行します。

```powershell
npm install --global .\deepseek-coding-companion-1.0.0.tgz
deepseek-coding-companion
```

## macOSへのインストール

Terminalで実行します。

```bash
npm install --global ./deepseek-coding-companion-1.0.0.tgz
deepseek-coding-companion
```

起動するとpairing tokenが表示されます。AI Codingの「設定 → Windows / macOS Companion」へ入力します。tokenは `~/.deepseek-coding-companion/pairing-token` にユーザー専用権限で保存されます。

## SMB

1. AI Codingの「セッション起動 → SMB Mount」を開く。
2. コンピュータ名またはIPアドレス、共有名、任意のユーザー名を入力する。
3. 「OSのSMB接続画面を開く」を押す。
4. Explorer／Finderの認証画面でパスワードを入力する。
5. 接続後、「接続済みSMBフォルダを選択」を押す。

資格情報の保存・更新・削除はWindows Credential Manager／macOS Keychainの責務です。Companionはパスワードを受信しません。

## セキュリティ上の境界

Companion版OpenCodeは利用PCのユーザー権限で動作します。Linux版のbubblewrapと同等のOSレベル分離はWindows/macOS実機では未検証です。そのため、署名済み配布物、Windows/macOS実機E2E、外付けドライブ差替え、junction／alias／reparse point試験が完了するまでは正式リリース判定を行いません。
