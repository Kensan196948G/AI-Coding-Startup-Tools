# OpenCode runtime configuration

`profiles/` contains fail-closed OpenCode 1.18.21 profiles. They enable only the
`deepseek` provider and pin the Oh My OpenCode plugin. These files never contain
API keys; OpenCode reads `DEEPSEEK_API_KEY` from the process environment.

The permission layer is defense in depth. The launcher must still enter the
validated workspace and apply the operating-system sandbox before loading a
profile.
