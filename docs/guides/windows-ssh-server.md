# Windows OpenSSH Server 設定手順（Linux → Windows 接続用）

Linux（192.168.0.185）から Windows（192.168.0.143）へ SSH 接続し、PowerShell スクリプトを実行できるようにするための設定手順です。

すべて **Windows 側の管理者 PowerShell** で実行します。

## 1. OpenSSH Server の導入

### 方法A: 設定アプリ（GUI）

1. 「設定」→「システム」→「オプション機能」→「機能を表示」
2. 「OpenSSH サーバー」を検索して「インストール」

### 方法B: PowerShell（推奨）

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
```

導入確認:

```powershell
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
```

## 2. サービスの開始と自動起動

```powershell
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Get-Service sshd
```

`Status` が `Running`、`StartType` が `Automatic` になっていればOKです。

## 3. ファイアウォールで TCP 22 を許可

OpenSSH 導入時に「OpenSSH-Server-In-TCP」ルールが自動作成される場合があります。無い場合は手動で追加します。

```powershell
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

確認:

```powershell
Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' | Select-Object Name, Enabled, Direction, Action
```

## 4. Linux 側で鍵ペアを作成

**Linux 側**で実行します。パスフレーズは省略可能ですが、安全性のため設定推奨です。

```bash
ssh-keygen -t ed25519 -C "linux-to-windows" -f ~/.ssh/id_ed25519
```

公開鍵の内容を確認:

```bash
cat ~/.ssh/id_ed25519.pub
```

## 5. 公開鍵を Windows に登録

### 接続ユーザーが管理者の場合

管理者の公開鍵は `C:\ProgramData\ssh\administrators_authorized_keys` に置きます（通常の `authorized_keys` ではありません）。

```powershell
$pub = Get-Content C:\path\to\id_ed25519.pub
Set-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value $pub -Encoding ascii
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"
```

### 接続ユーザーが一般ユーザーの場合

```powershell
$pub = Get-Content C:\path\to\id_ed25519.pub
$dir = "$env:USERPROFILE\.ssh"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
Set-Content -Path "$dir\authorized_keys" -Value $pub -Encoding ascii
icacls "$dir\authorized_keys" /inheritance:r /grant "$env:USERNAME:F"
```

**重要**: 管理者ユーザーで接続する場合、`administrators_authorized_keys` の権限が正しくないと鍵認証が無視されます（`sshd` のログに `refusing to read ... administrators_authorized_keys` と出ます）。

## 6. sshd_config の確認・既定シェルの変更

### PubkeyAuthentication の有効化

`C:\ProgramData\ssh\sshd_config` を確認し、以下がコメントアウトされていないことを確認します。

```text
PubkeyAuthentication yes
PasswordAuthentication yes   # 初期段階では yes のままでよい（後述）
```

変更した場合はサービス再起動:

```powershell
Restart-Service sshd
```

### 既定シェルを PowerShell に設定（推奨）

SSH 接続時に PowerShell が起動するようレジストリを設定します（PowerShell 7 がある場合は `pwsh.exe`）。

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
```

PowerShell 7 の場合:

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Program Files\PowerShell\7\pwsh.exe" -PropertyType String -Force
```

## 7. Linux から接続テスト

**Linux 側**で実行します。

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 user@192.168.0.143 "powershell -NoProfile -NonInteractive -Command \"Write-Output AI_STARTUP_TOOLS_SSH_OK\""
```

`AI_STARTUP_TOOLS_SSH_OK` が返れば成功です。初回はホスト鍵の確認メッセージが出るため、一度対話的に接続して `yes` を答えるか、`-o StrictHostKeyChecking=accept-new` を付けます。

接続確認スクリプトも利用できます（Linux側）:

```bash
./scripts/linux/check-windows-ssh.sh --host 192.168.0.143 --user user --projects-root 'C:\projects'
```

## 8. セキュリティ強化（接続確認後）

1. **パスワード認証を無効化**（鍵認証が動作してから）
   - `C:\ProgramData\ssh\sshd_config` で `PasswordAuthentication no`
   - `Restart-Service sshd`
2. **接続ユーザーの限定**（必要に応じて）
   - `sshd_config` に `AllowUsers user` を追加
3. **ポート変更**（必要に応じて）
   - `Port 2222` などに変更し、ファイアウォールルールも合わせる
4. ファイアウォールで 22 番以外の不要な受信を許可しない

## トラブルシューティング

| 症状 | 確認・対処 |
|---|---|
| `Connection timed out` | sshd サービスが起動しているか / ファイアウォールで 22 が許可されているか |
| `Permission denied (publickey)` | 公開鍵の登録先・`icacls` の権限を確認 / sshd_config の `PubkeyAuthentication` |
| 管理者ユーザーで鍵が無視される | `C:\ProgramData\ssh\administrators_authorized_keys` の権限が `SYSTEM` と `Administrators` のみになっているか |
| `Bad owner or permissions` | 鍵ファイル・`authorized_keys` の権限を見直す |
| 既定シェルが cmd のまま | `HKLM:\SOFTWARE\OpenSSH` の `DefaultShell` を確認 |

## エラーログの確認

```powershell
Get-WinEvent -LogName OpenSSH/Operational -MaxEvents 20 | Format-List TimeCreated, Message
```
