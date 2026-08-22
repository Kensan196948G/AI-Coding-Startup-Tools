# DeepSeek-only validation boundary

Run `node scripts/validation/validate-deepseek-runtime.mjs` before launch. The
validator checks exact runtime pins, OpenCode's provider allowlist, every model
reference, every Oh My OpenCode agent assignment, and disabled fallback.

The validator intentionally checks only the environment variable name. It never
reads or prints `DEEPSEEK_API_KEY`; credential presence is a launcher preflight.
