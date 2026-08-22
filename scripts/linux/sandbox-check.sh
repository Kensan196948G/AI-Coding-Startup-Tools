#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
command -v bwrap >/dev/null 2>&1 || { printf '[ERROR] bubblewrapがありません\n' >&2; exit 2; }
node --test "$ROOT/tests/sandbox/"*.test.mjs "$ROOT/tests/security/"*.test.mjs
