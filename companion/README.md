# DeepSeek Coding Companion

Windows 11／macOSの利用PCで動作し、`https://ai-coding.mirai-dx-platform.com` から次の操作だけを受け付けるローカル補助プロセスです。

- OS標準画面によるLocal／外付けHDDフォルダ選択
- Windows／macOSのSMB接続と共有フォルダ選択
- 選択済みWorkspaceでのOpenCode `1.18.21` 起動
- DeepSeek APIキーの60秒・一回限りの受け渡し

Companionは `127.0.0.1:47831` だけで待受けます。LAN公開、任意コマンド実行、ブラウザからのraw path指定は行いません。SMBパスワードは接続時に一回だけ受け取り、Windows PowerShell／macOS AppleScriptの標準入力へ渡した後に破棄します。引数・環境変数・ログ・Linuxサーバーへは渡しません。

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

`dist/deepseek-coding-companion-1.0.3.tgz` が生成されます。

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
npm install --global .\deepseek-coding-companion-1.0.3.tgz
deepseek-coding-companion
```

## macOSへのインストール

Terminalで実行します。

```bash
npm install --global ./deepseek-coding-companion-1.0.3.tgz
deepseek-coding-companion
```

Companion 1.0.2以降は、起動中であれば `https://ai-coding.mirai-dx-platform.com` が短時間のブラウザ用tokenを自動取得するため、通常は手入力不要です。1.0.3以降は起動時にも永続pairing tokenを表示しません。復旧時に管理者が明示的に `deepseek-coding-companion recovery-token` を実行した場合だけ表示します。永続tokenは `~/.deepseek-coding-companion/pairing-token` にユーザー専用権限で保存されます。

### バックグラウンド移行

共有PCなどでコンソール画面を出しっぱなしにしたくない場合、起動直後に表示される案内で **Enterキー** を押すと、ウィンドウを閉じて同じポートでバックグラウンドへ移行します（Ctrl+Cでそのまま終了も可能）。移行後はタスクマネージャーの「詳細」タブから `deepseek-coding-companion` プロセスとして終了できます。

自動起動（スタートアップ登録・タスクスケジューラ）でコンソールを持たずに起動した場合は、Enter入力を待つ対話プロンプト自体が自動的にスキップされ、最初からバックグラウンド相当で動作します。明示的にバックグラウンドで起動したい場合は `deepseek-coding-companion --background` を使用してください。

## SMB

1. AI Codingの「セッション起動 → SMB Mount」を開く。
2. コンピュータ名またはIPアドレス、共有名／共有フォルダ名を入力する。
3. 必須の接続先ユーザー名と接続パスワードを入力する。
4. 「SMBへ接続してフォルダを選択」を押す。
5. 接続後に表示されるOS標準画面で共有フォルダを選択する。

入力パスワードは接続処理だけに使用し、Companionは保存しません。既存資格情報の保存・更新・削除はWindows Credential Manager／macOS Keychainの責務です。

## セキュリティ上の境界

Companion版OpenCodeは利用PCのユーザー権限で動作します。Linux版のbubblewrapと同等のOSレベル分離はWindows/macOS実機では未検証です。そのため、署名済み配布物、Windows/macOS実機E2E、外付けドライブ差替え、junction／alias／reparse point試験が完了するまでは正式リリース判定を行いません。
