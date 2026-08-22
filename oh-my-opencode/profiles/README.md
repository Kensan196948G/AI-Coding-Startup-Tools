# Oh My OpenCode profile

`../deepseek-only.json` is the only supported profile for 4.19.4. Every enabled
builtin agent has a single explicit DeepSeek model. Model arrays and
`fallback_models` are deliberately absent because upstream 4.19.4 has open
model-resolution defects for delegated subagents. OpenCode's provider allowlist
still rejects any plugin attempt to resolve a non-DeepSeek provider.
