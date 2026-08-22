# ADR-0004: DeepSeek-only Workspace Sandbox

- 状態: Accepted
- 日付: 2026-08-22

OpenCodeを実行エンジン、`oh-my-opencode`をAgent orchestration、DeepSeekを唯一のProviderとします。選択済み単一Workspaceだけをbubblewrapへbindし、OpenCode permissionとOS権限を重ねます。Provider、Workspace、Secret、危険commandの検証はfail-closedとします。
