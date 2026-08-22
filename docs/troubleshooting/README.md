# トラブルシューティング

- version mismatch: `common/config/compatibility.yml`のexact versionへ揃える。
- Workspace拒否: 許可Root直下の実在Projectか、symlinkではないか確認する。
- SMB拒否: 管理者が事前mountし、mount point検証が成功することを確認する。
- Provider拒否: `enabled_providers`がDeepSeekだけで、全AgentがDeepSeek modelへ解決されるか確認する。
- PTY不可: Linuxに`python3`の`pty`モジュールがあるか確認する。
