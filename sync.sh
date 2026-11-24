#!/usr/bin/env bash
# Копия исходника в живой корень загрузки Desktop.
# Windows Desktop + WSL-бэкенд: renderer грузит standalone-плагины из
# %LOCALAPPDATA%\hermes\desktop-plugins, а не из HERMES_HOME бэкенда.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/desktop/plugin.js"
targets=()
[ -n "${ANORI_LIVE:-}" ] && targets+=("$ANORI_LIVE")
for c in \
  "$HOME/.hermes/desktop-plugins/anori-grid" \
  "/mnt/c/Users/weed/AppData/Local/hermes/desktop-plugins/anori-grid" \
  "$HOME/AppData/Local/hermes/desktop-plugins/anori-grid"; do
  [ -d "$(dirname "$c")" ] && targets+=("$c")
done
if [ "${#targets[@]}" -eq 0 ]; then
  echo "живой корень desktop-plugins не найден; укажи ANORI_LIVE=<путь>" >&2
  exit 1
fi
for t in "${targets[@]}"; do
  mkdir -p "$t"
  cp "$src" "$t/plugin.js"
  echo "synced -> $t/plugin.js"
done
