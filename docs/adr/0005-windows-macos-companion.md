# ADR-0005: Windows/macOS CompanionによるLocal・SMB Workspace

- 状態: Accepted for development / Production verification pending
- 日付: 2026-08-22

## Context

ホストされたWebブラウザは、Windows/macOSの実ファイルパス、外付けHDD、Credential Manager、Keychain、SMB mountを直接操作できない。Linuxサーバーからも、ブラウザ利用PCだけが到達可能なSMB接続先を扱えない。

## Decision

利用PCで動作するper-user Companionを追加する。

```text
AI Coding WebUI (Cloudflare Access)
        │ fetch / PNA / exact Origin
        ▼
127.0.0.1:47831 Companion
        ├─ Native folder picker ─ Local / external HDD / mounted SMB
        ├─ Explorer / Finder ─ OS credential UI
        └─ Native Terminal ─ OpenCode 1.18.21 / DeepSeek only
```

- Companionはloopbackだけで待受ける。
- 許可Originは8時間有効の256bitブラウザ用tokenを自動取得し、操作APIはそのtokenを要求する。
- OriginなしのネイティブTerminal連携は、ユーザー専用ファイルに保存した永続256bit pairing tokenを要求する。
- 許可Originは完全一致とし、`file:`、`null`、任意Originを拒否する。
- ブラウザからraw pathや任意commandを受け取らない。
- SMB passwordはWebUIからloopback Companionへ一回だけ送り、標準入力経由でOSのSMB接続APIへ渡した後に破棄する。引数・環境変数・ログ・Linuxへ送らない。
- 資格情報の永続保存・更新・削除はOS Credential Storeへ委任する。
- DeepSeek APIキーは60秒以内に一回だけclaimし、OpenCode子プロセス環境へ渡す。
- Linux Server Workspace方式は既存機能として保持する。

## Production gates

- Windows配布物のコード署名
- macOSのコード署名・notarization
- Windows junction／reparse pointとmacOS alias／symlinkの拒否試験
- 外付けボリュームの切断・再接続・差替え試験
- 利用PC上で選択Workspace外を読めないOS-level sandboxの実証
- Windows／Linux／macOS SMB serverとの実機E2E

これらが未完了の場合、Companion機能は開発版として表示し、Linux版と同等のSandboxを実装済みとは表記しない。
