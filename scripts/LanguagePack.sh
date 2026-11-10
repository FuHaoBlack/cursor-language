#!/bin/bash
# macOS double-click entry; Cursor supplies the JavaScript runtime.
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
action=""
explicit="${CURSOR_INSTALL_DIR:-}"
launch=1
pause=1
for arg in "$@"; do
  case "$arg" in
    --preview|--restore|--status)
      if [ -n "$action" ]; then echo '[错误] 一次只能指定一个操作。'; exit 1; fi
      action="$arg" ;;
    --dir=*) explicit="${arg#--dir=}" ;;
    --no-launch) launch=0 ;;
    --no-pause) pause=0 ;;
    *) echo "[错误] 不支持的参数：$arg"; exit 1 ;;
  esac
done

finish() {
  local result="$1"
  if [ "$pause" -eq 1 ] && [ -t 0 ]; then printf '\n按回车关闭窗口'; read -r _; fi
  exit "$result"
}
if [ "$(uname -s)" != Darwin ]; then echo '[错误] 此脚本仅用于 macOS。'; finish 1; fi

candidates=()
add_candidate() {
  local candidate="$1" level=0 old
  [ -n "$candidate" ] || return
  [ -f "$candidate" ] && candidate="$(dirname "$candidate")"
  case "$candidate" in *.app) candidate="$candidate/Contents" ;; esac
  while [ "$level" -lt 5 ] && [ "$candidate" != / ] && [ -n "$candidate" ]; do
    if [ -f "$candidate/Resources/app/product.json" ] && [ -f "$candidate/MacOS/Cursor" ]; then
      candidate="$(cd -- "$candidate" && pwd -P)" || return
      for old in "${candidates[@]}"; do [ "$old" = "$candidate" ] && return; done
      candidates+=("$candidate")
      return
    fi
    candidate="$(dirname "$candidate")"; level=$((level + 1))
  done
}
if [ -n "$explicit" ]; then add_candidate "$explicit"
else
  add_candidate /Applications/Cursor.app
  add_candidate "$HOME/Applications/Cursor.app"
  if command -v mdfind >/dev/null 2>&1; then
    while IFS= read -r found; do add_candidate "$found"; done < <(mdfind 'kMDItemFSName == "Cursor.app" && kMDItemContentType == "com.apple.application-bundle"' 2>/dev/null)
  fi
fi
if [ "${#candidates[@]}" -eq 0 ]; then echo '[错误] 未找到 Cursor.app。请用 --dir=/路径/Cursor.app 指定。'; finish 1; fi
if [ "${#candidates[@]}" -gt 1 ]; then
  echo '发现多份 Cursor，请选择目标：'
  for ((i=0; i<${#candidates[@]}; i++)); do printf '  %d. %s\n' "$((i+1))" "${candidates[i]}"; done
  if [ ! -t 0 ]; then echo '[错误] 非交互运行需要 --dir 指定目标。'; finish 1; fi
  read -r -p '输入编号：' answer
  case "$answer" in ''|*[!0-9]*) echo '[错误] 无效选择。'; finish 1 ;; esac
  if [ "$answer" -lt 1 ] || [ "$answer" -gt "${#candidates[@]}" ]; then echo '[错误] 无效选择。'; finish 1; fi
  root="${candidates[answer-1]}"
else root="${candidates[0]}"
fi
echo "Cursor 安装目录：$root"
runtime="$root/MacOS/Cursor"
valid_runtime() {
  local version
  version="$(ELECTRON_RUN_AS_NODE=1 "$1" --version 2>/dev/null)" || return 1
  [[ "$version" =~ ^v([0-9]+)\.([0-9]+)\. ]] || return 1
  [ "${BASH_REMATCH[1]}" -gt 18 ] || { [ "${BASH_REMATCH[1]}" -eq 18 ] && [ "${BASH_REMATCH[2]}" -ge 17 ]; }
}
if ! valid_runtime "$runtime"; then
  runtime="$(command -v node)"
fi
if [ -z "$runtime" ] || ! valid_runtime "$runtime"; then echo '[错误] Cursor 内置运行时不可用，请安装 Node.js 22 或更高版本。'; finish 1; fi
args=("$SCRIPT_DIR/LanguagePack.mjs" "--dir=$root")
[ -n "$action" ] && args+=("$action")
ELECTRON_RUN_AS_NODE=1 "$runtime" "${args[@]}"
result=$?
if [ "$result" -eq 0 ] && [ -z "$action" ] && [ "$launch" -eq 1 ]; then open "${root%/Contents}"; fi
finish "$result"
