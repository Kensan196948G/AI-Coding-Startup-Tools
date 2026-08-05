#!/usr/bin/env bash
# AI Coding Startup Tools 共通ライブラリ (Linux)
# 終了コード定数は他スクリプトから参照するため、このファイル内では「未使用」と判定される
# shellcheck disable=SC2034
set -Eeuo pipefail

# 終了コード (詳細設計 4.3)
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL=1
readonly EXIT_ARGUMENT=2
readonly EXIT_DEPENDENCY=3
readonly EXIT_CANCELLED=4
readonly EXIT_SECURITY=5
readonly EXIT_CONFLICT=6
readonly EXIT_EXTERNAL=7
readonly EXIT_PARTIAL=10

# ツールキットルート (scripts/linux/lib/ の 3 階層上がリポジトリルート)
COMMON_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(cd "$COMMON_LIB_DIR/../../.." && pwd -P)"
readonly TOOLKIT_ROOT

# バージョンは package.json を単一の正本として動的に読み取る。
# ハードコードすると package.json の bump と乖離するため、必ずこの関数経由で取得する。
read_toolkit_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$TOOLKIT_ROOT/package.json" | head -n 1
}
TOOLKIT_VERSION="$(read_toolkit_version)"
readonly TOOLKIT_VERSION

log_info()  { printf '[INFO]  %s\n' "$1"; }
log_warn()  { printf '[WARN]  %s\n' "$1" >&2; }
log_error() { printf '[ERROR] %s\n' "$1" >&2; }

die() {
  log_error "$2"
  exit "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 \
    || die "$EXIT_DEPENDENCY" "必須コマンド '$1' が見つかりません。"
}

# プロジェクトディレクトリの解決と安全検証
resolve_project_dir() {
  local dir="$1"
  local resolved
  if [[ -z "$dir" ]]; then
    die "$EXIT_ARGUMENT" "プロジェクトディレクトリが指定されていません。"
  fi
  if [[ ! -d "$dir" ]]; then
    die "$EXIT_ARGUMENT" "プロジェクトディレクトリが見つかりません: $dir"
  fi
  resolved="$(cd "$dir" && pwd -P)" \
    || die "$EXIT_ARGUMENT" "プロジェクトディレクトリにアクセスできません: $dir"
  if [[ "$resolved" == "/" ]]; then
    die "$EXIT_SECURITY" "ルートディレクトリをプロジェクトに指定できません。"
  fi
  if [[ -n "${HOME:-}" && "$resolved" == "$HOME" ]]; then
    die "$EXIT_SECURITY" "ホームディレクトリ全体をプロジェクトに指定できません。"
  fi
  printf '%s' "$resolved"
}

# 出力パスの安全検証 (プロジェクトルート外へのトラバーサル拒否)
resolve_safe_output() {
  local root="$1"
  local rel="$2"
  local root_real candidate current part real
  if [[ "$rel" =~ ^/ || "$rel" =~ ^[A-Za-z]: ]]; then
    die "$EXIT_SECURITY" "出力パスは相対パスで指定してください: $rel"
  fi
  if [[ "$rel" =~ (^|/)\.\.(/|$) ]]; then
    die "$EXIT_SECURITY" "出力パスに '..' を含めることはできません: $rel"
  fi
  root_real="$(cd "$root" && pwd -P)" \
    || die "$EXIT_SECURITY" "プロジェクトルートにアクセスできません: $root"
  candidate="$root_real/$rel"

  # 既存コンポーネントのシンボリックリンク検査 (ルート外を指す場合は拒否)
  current="$root_real"
  local IFS='/'
  read -ra parts <<< "$rel"
  unset IFS
  for part in "${parts[@]:-}"; do
    [[ -z "$part" ]] && continue
    current="$current/$part"
    if [[ -L "$current" ]]; then
      real="$(readlink -f "$current")" \
        || die "$EXIT_SECURITY" "シンボリックリンクを解決できません: $rel"
      if [[ "$real" != "$root_real" && "$real" != "$root_real"/* ]]; then
        die "$EXIT_SECURITY" "シンボリックリンクがルート外を指しています: $rel"
      fi
    fi
  done

  case "$candidate" in
    "$root_real"|"$root_real"/*) ;;
    *) die "$EXIT_SECURITY" "出力パスがプロジェクトルート外です: $rel" ;;
  esac
  printf '%s' "$candidate"
}

# プロンプト変数の未解決チェック
check_prompt_variables() {
  local prompt_file="$1"
  shift
  local -a provided=("$@")
  local -A have=()
  local entry var missing=0
  for entry in "${provided[@]:-}"; do
    [[ -z "$entry" ]] && continue
    var="${entry%%=*}"
    have["$var"]=1
  done
  while IFS= read -r var; do
    [[ -z "$var" ]] && continue
    if [[ -z "${have[$var]+x}" ]]; then
      log_error "未解決のプロンプト変数があります: $var (--set $var=value を指定してください)"
      missing=1
    fi
  done < <(grep -oE '\{\{[A-Z][A-Z0-9_]*\}\}' "$prompt_file" | tr -d '{}' | sort -u)
  if [[ "$missing" -eq 1 ]]; then
    exit "$EXIT_ARGUMENT"
  fi
}

# 操作 ID の生成 (UTC)
new_operation_id() {
  printf 'op-%s-%s' "$(date -u +%Y%m%dT%H%M%SZ)" "${RANDOM}${RANDOM}"
}

# バックアップ生成
backup_target() {
  local target="$1" backup_dir="$2"
  if [[ -e "$target" ]]; then
    mkdir -p "$backup_dir"
    cp -a "$target" "$backup_dir/$(basename "$target")"
    log_info "バックアップ作成: $target -> $backup_dir/$(basename "$target")"
  fi
}

# 原子的更新 (同一ディレクトリ内の一時ファイル + rename)
atomic_write() {
  local target="$1" source="$2"
  local dir tmp
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  tmp="$(mktemp "$dir/.tmp.XXXXXX")"
  cp "$source" "$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$target"
}

# テキスト内容の原子的書込み (同一ディレクトリ内の一時ファイル + rename)
atomic_write_text() {
  local target="$1" content="$2"
  local dir tmp
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  tmp="$(mktemp "$dir/.tmp.XXXXXX")"
  printf '%s\n' "$content" > "$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$target"
}

# 監査ログの追記 (秘密値は記録しない)
append_audit_log() {
  local log_dir="$1" operation_id="$2"
  shift 2
  local ts action result target
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  action="$1"
  result="$2"
  target="$3"
  mkdir -p "$log_dir"
  printf '{"timestamp":"%s","level":"info","operationId":"%s","component":"%s","action":"%s","target":"%s","result":"%s","toolkitVersion":"%s"}\n' \
    "$ts" "$operation_id" "${SCRIPT_NAME:-toolkit}" "$action" "$target" "$result" "$TOOLKIT_VERSION" \
    >> "$log_dir/audit.jsonl"
}
