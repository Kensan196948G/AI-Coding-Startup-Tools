# Profile validation

OpenCode profiles are checked locally by
`scripts/validation/validate-deepseek-runtime.mjs`. A profile is rejected unless
its provider allowlist is exactly `["deepseek"]`, the plugin has an exact pin,
all model references use `deepseek/`, external directory access is denied, and
secret-read deny patterns are present.
