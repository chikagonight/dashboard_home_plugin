#!/usr/bin/env bash
# Локальная проверка пакета без сети и без живого Desktop:
# манифест, desktop-половина, поведение sync.sh. Выход != 0 при любом FAIL.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"
fail=0
say() { printf '  %-34s %s\n' "$1" "$2"; [ "$2" = OK ] || fail=1; }
ok()  { if eval "$2" >/dev/null 2>&1; then say "$1" OK; else say "$1" FAIL; fi; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}hermes-verify-XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

grep -q '^name: anori-grid$' plugin.yaml && grep -q '^version: ' plugin.yaml && grep -q '^description: ' plugin.yaml \
  && say "plugin.yaml: name/version/description" OK || say "plugin.yaml: name/version/description" FAIL
[ -f desktop/plugin.js ] && say "desktop/plugin.js присутствует" OK || say "desktop/plugin.js присутствует" FAIL
cp desktop/plugin.js "$tmp/p.mjs"; ok "node --check desktop/plugin.js" "node --check $tmp/p.mjs"
ok "bash -n sync.sh" "bash -n sync.sh"
ok "hermes plugins validate" "hermes plugins validate . --json | grep -q '\"ok\": true'"

# sync.sh: отказ без целей / отказ при пустом id / успех на двух корнях
( ANORI_NO_AUTO=1 HOME="$tmp/none" bash sync.sh ) >"$tmp/a" 2>&1
[ $? -eq 1 ] && grep -q 'не найден' "$tmp/a" && say "sync: нет целей -> exit 1" OK || say "sync: нет целей -> exit 1" FAIL
mkdir -p "$tmp/home/.hermes/desktop-plugins" "$tmp/win/Users/someone/AppData/Local/hermes/desktop-plugins" "$tmp/prj/desktop"
cp plugin.yaml desktop/plugin.js "$tmp/prj/" 2>/dev/null; cp desktop/plugin.js "$tmp/prj/desktop/"
sed "s|/mnt/c/Users/\*/|$tmp/win/Users/*/|; s|\"\$here/plugin.yaml\"|\"$here/plugin.yaml\"|" sync.sh >"$tmp/prj/sync.sh"
( cd "$tmp/prj" && HOME="$tmp/home" bash sync.sh ) >"$tmp/b" 2>&1
[ "$(grep -c 'synced ->' "$tmp/b")" = 2 ] && say "sync: автопоиск двух корней" OK || say "sync: автопоиск двух корней" FAIL
for f in "$tmp/home/.hermes/desktop-plugins/anori-grid/plugin.js" \
         "$tmp/win/Users/someone/AppData/Local/hermes/desktop-plugins/anori-grid/plugin.js"; do
  case "$f" in *"$tmp/home/"*) tag="WSL-home";; *) tag="win-профиль";; esac
  cmp -s "$f" desktop/plugin.js && say "sync: байты == исходник ($tag)" OK || say "sync: байты == исходник ($tag)" FAIL
done
[ ! -e "$tmp/home/.hermes/desktop-plugins/plugin.js" ] && say "sync: не пишет в корень" OK || say "sync: не пишет в корень" FAIL

[ "$fail" = 0 ] && echo "verify: ALL PASS" || echo "verify: FAILURES"
exit "$fail"
