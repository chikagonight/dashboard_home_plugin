#!/usr/bin/env bash
# Копия исходника в живой корень загрузки Desktop.
# Windows Desktop + WSL-бэкенд: renderer грузит standalone-плагины из
# %LOCALAPPDATA%\hermes\desktop-plugins, а не из HERMES_HOME бэкенда.
#
# ANORI_LIVE=<путь>   добавить явную цель; ANORI_NO_AUTO=1 — только она.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/desktop/plugin.js"
id="$(basename "$here")"

targets=()
[ -n "${ANORI_LIVE:-}" ] && targets+=("$ANORI_LIVE")
if [ -z "${ANORI_NO_AUTO:-}" ]; then
  for c in "$HOME/.hermes/desktop-plugins" \
           /mnt/c/Users/*/AppData/Local/hermes/desktop-plugins \
           "$HOME/AppData/Local/hermes/desktop-plugins"; do
    [ -d "$c" ] && targets+=("$c/$id")
  done
fi
if [ "${#targets[@]}" -eq 0 ]; then
  echo "живой корень desktop-plugins не найден; укажи ANORI_LIVE=<путь>" >&2
  exit 1
fi
for t in "${targets[@]}"; do
  mkdir -p "$t"
  cp "$src" "$t/plugin.js"
  echo "synced -> $t/plugin.js"
done
