#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/linux/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
開発文書テンプレート生成 (Linux)

使い方:
  ./scripts/linux/render-template.sh --template <dir> --project-dir <dir> --set NAME=value ...

オプション:
  --template <dir>     テンプレートディレクトリ (例: templates/requirements)
  --project-dir <path> 出力先プロジェクト (既定: 現在のディレクトリ)
  --set NAME=value     変数の指定 (複数指定可)
  --dry-run            出力内容のみ表示 (既定)
  --apply              実際にファイルを生成
  --yes                確認を省略
  --json               機械可読出力
  --version            バージョン表示
  --help               このヘルプを表示

終了コード: 0 成功 / 2 引数・変数不正 / 5 安全違反 / 6 ファイル競合
EOF
}

TEMPLATE_DIR=""
PROJECT_DIR="$(pwd)"
DRY_RUN=1
YES=0
JSON_OUTPUT=0
declare -a SET_VARS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --template) TEMPLATE_DIR="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --set) SET_VARS+=("$2"); shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --apply) DRY_RUN=0; shift ;;
    --yes) YES=1; shift ;;
    --json) JSON_OUTPUT=1; shift ;;
    --version) echo "$TOOLKIT_VERSION"; exit "$EXIT_SUCCESS" ;;
    --help|-h) usage; exit "$EXIT_SUCCESS" ;;
    *) die "$EXIT_ARGUMENT" "不明なオプション: $1 (--help を参照)" ;;
  esac
done

[[ -n "$TEMPLATE_DIR" ]] || die "$EXIT_ARGUMENT" "--template を指定してください。"
[[ -f "$TEMPLATE_DIR/manifest.yml" ]] || die "$EXIT_ARGUMENT" "マニフェストが見つかりません: $TEMPLATE_DIR/manifest.yml"

MANIFEST="$TEMPLATE_DIR/manifest.yml"
ENTRYPOINT="$(grep -m1 '^entrypoint:' "$MANIFEST" | awk '{print $2}' | tr -d '"')"
OUTPUT_TEMPLATE="$(grep -m1 '^output:' "$MANIFEST" | awk '{print $2}' | tr -d '"')"
CONFLICT_POLICY="$(grep -m1 '^conflictPolicy:' "$MANIFEST" | awk '{print $2}')"

[[ -n "$ENTRYPOINT" ]] || die "$EXIT_ARGUMENT" "マニフェストに entrypoint がありません。"
[[ -n "$OUTPUT_TEMPLATE" ]] || die "$EXIT_ARGUMENT" "マニフェストに output がありません。"

PROJECT_DIR="$(resolve_project_dir "$PROJECT_DIR")" || exit $?

# 変数辞書の構築
declare -A VARS=()
for entry in "${SET_VARS[@]}"; do
  name="${entry%%=*}"
  value="${entry#*=}"
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "$EXIT_ARGUMENT" "変数名が不正です: $name"
  VARS["$name"]="$value"
done

# 必須変数の確認
REQUIRED="$(sed -n '/^requiredVariables:/,/^[a-zA-Z]/p' "$MANIFEST" | grep -E '^\s*-\s' | awk '{print $2}')"
for var in $REQUIRED; do
  if [[ -z "${VARS[$var]+x}" ]]; then
    die "$EXIT_ARGUMENT" "必須変数が指定されていません: $var (--set $var=value)"
  fi
done

# 本文の読み込みと置換
BODY="$(cat "$TEMPLATE_DIR/$ENTRYPOINT")"
for name in "${!VARS[@]}"; do
  BODY="${BODY//\{\{$name\}\}/${VARS[$name]}}"
done

# 未解決変数の検出
UNRESOLVED="$(printf '%s' "$BODY" | grep -oE '\{\{[A-Z][A-Z0-9_]*\}\}' | sort -u || true)"
if [[ -n "$UNRESOLVED" ]]; then
  die "$EXIT_ARGUMENT" "未解決の変数があります: $(printf '%s' "$UNRESOLVED" | tr '\n' ' ')"
fi

# 出力パスの解決
OUTPUT_REL="$OUTPUT_TEMPLATE"
for name in "${!VARS[@]}"; do
  OUTPUT_REL="${OUTPUT_REL//\{\{$name\}\}/${VARS[$name]}}"
done
OUTPUT_ABS="$(resolve_safe_output "$PROJECT_DIR" "$OUTPUT_REL")" || exit "$EXIT_SECURITY"

if [[ -e "$OUTPUT_ABS" ]]; then
  log_warn "既存ファイルがあります: $OUTPUT_REL (conflictPolicy: ${CONFLICT_POLICY:-fail})"
  diff -u "$OUTPUT_ABS" <(printf '%s' "$BODY") >/dev/null 2>&1 \
    && die "$EXIT_CONFLICT" "既存ファイルと同一のためスキップします。"
  die "$EXIT_CONFLICT" "既存ファイルとの衝突のため生成しません。--apply でも上書きしません。"
fi

log_info "出力先: $OUTPUT_REL"
if [[ "$JSON_OUTPUT" -eq 1 ]]; then
  printf '{"output":"%s","bytes":%d}\n' "$OUTPUT_REL" "${#BODY}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log_info "--- 生成内容 (先頭 40 行) ---"
  printf '%s\n' "$BODY" | head -n 40
  log_info "dry-run のため書き込みません。--apply で生成します。"
  exit "$EXIT_SUCCESS"
fi

if [[ "$YES" -ne 1 ]]; then
  log_info "ファイルを生成しますか? (yes/no)"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "$EXIT_CANCELLED" "キャンセルしました。" ;;
  esac
fi

mkdir -p "$(dirname "$OUTPUT_ABS")"
printf '%s\n' "$BODY" > "$(dirname "$OUTPUT_ABS")/.tmp.$$"
mv -f "$(dirname "$OUTPUT_ABS")/.tmp.$$" "$OUTPUT_ABS"
log_info "生成しました: $OUTPUT_ABS"
exit "$EXIT_SUCCESS"
