#!/usr/bin/env python3
"""Собирает из desktop/plugin.js набор самостоятических плагинов-виджетов.

Источник истины — desktop/plugin.js: блоки между маркерами
`// ===== [HELPER] =====` / `[WIDGET <id>] =====`. Каждый виджет получает
общие хелперы, CSS и хост одной панели (scripts/pack_host.js).

    python3 scripts/make_pack.py            # -> pack/anori-<widget>/
    python3 scripts/make_pack.py --zip      # + dist/anori-pack.zip

Проверка результата: `node --check` на каждом собранном файле.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "desktop", "plugin.js")
HOST = os.path.join(ROOT, "scripts", "pack_host.js")
PACK = os.path.join(ROOT, "pack")
DIST = os.path.join(ROOT, "dist")

NEED = re.compile(r"\b(host|Input|Textarea|SandboxedFrame|useValue|atom)\b")
ALWAYS = {"PANES_AREA", "PALETTE_AREA", "Textarea", "useValue", "atom", "host"}


def blocks(src: str):
    helpers = re.search(r"// ===== \[HELPER\] =====\n(.*?)// ===== \[/HELPER\] =====", src, re.S)
    css = re.search(r"const CSS = `(.*?)`\n", src, re.S)
    widgets = re.findall(r"// ===== \[WIDGET (\w+)\] =====\n(.*?)// ===== \[/WIDGET\] =====", src, re.S)
    if not helpers or not css or not widgets:
        sys.exit("в исходнике нет маркеров [HELPER] / [WIDGET] — нечего собирать")
    return helpers.group(1), css.group(1), dict(widgets), [name for name, _ in widgets]


def render(name: str, widget: str, helpers: str, css: str, host: str) -> str:
    imports = sorted(set(NEED.findall(widget)) | ALWAYS)
    head = (
        f"// Anori widget «{name}» — автономный плагин Hermes Desktop (один файл, без сборки).\n"
        "// cfg хранится в ctx.storage; внешние ссылки идут через ctx.os.openExternal.\n"
        "import {\n  " + ", ".join(imports) + "\n} from '@hermes/plugin-sdk'\n"
        "import { useEffect, useRef, useState } from 'react'\n"
        "import { jsx } from 'react/jsx-runtime'\n\n"
        f"const ID = 'anori-{name}'\n\n"
    )
    body = (
        helpers
        + "\nconst CSS = `" + css + "`\n\n"
        + "const WIDGETS = {}\nconst def = (d) => { WIDGETS[d.type] = d }\n\n"
        + widget + "\n\n" + f"const DEF = WIDGETS['{name}']\n" + host
    )
    return head + body


def readme(name: str, label: str, pid: str) -> str:
    return f"""# {pid}

Anori-виджет **{label}** как отдельный плагин Hermes Desktop. Один файл, без сборки.

## Установка
- Linux/macOS: `mkdir -p ~/.hermes/desktop-plugins/{pid} && cp plugin.js ~/.hermes/desktop-plugins/{pid}/`
- Windows (нативный Desktop): `%LOCALAPPDATA%\\hermes\\desktop-plugins\\{pid}\\plugin.js`

Приложение следит за папкой `desktop-plugins` и подхватывает файл само; если нет —
⌘K / Ctrl+K → «Reload desktop plugins». Панель появляется в правой колонке,
команда «Anori: {label}» — в палитре.

## Данные
Конфиг виджета хранится в хранилище плагина (`ctx.storage`). Внешняя сеть —
только там, где её запрашивает сам виджет (подсказка в шапке панели).

## Происхождение
Собрано `scripts/make_pack.py` из `desktop/plugin.js` этого же пакета.
Правки вносить в источник и пересобирать, а не в этот файл.
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", action="store_true", help="собрать dist/anori-pack.zip")
    args = ap.parse_args()

    src = open(SOURCE, encoding="utf-8").read()
    helpers, css, widgets, order = blocks(src)
    host = open(HOST, encoding="utf-8").read()

    built, failed = [], []
    for name in order:
        pid = "anori-" + name
        out = os.path.join(PACK, pid)
        os.makedirs(out, exist_ok=True)
        js = render(name, widgets[name], helpers, css, host)
        path = os.path.join(out, "plugin.js")
        open(path, "w", encoding="utf-8").write(js)
        probe = path + ".mjs"  # node --check определяет ESM по расширению
        open(probe, "w", encoding="utf-8").write(js)
        rc = subprocess.run(["node", "--check", probe], capture_output=True, text=True)
        os.remove(probe)
        label = re.search(r"label: '([^']+)'", widgets[name])
        if rc.returncode == 0:
            open(os.path.join(out, "README.md"), "w", encoding="utf-8").write(
                readme(name, label.group(1) if label else name, pid))
            built.append((pid, len(js.splitlines())))
        else:
            failed.append((pid, rc.stderr.strip().splitlines()[:3]))

    lines = sum(n for _, n in built)
    print(f"pack: {len(built)} плагинов, {lines} строк, каталог {PACK}")
    for pid, err in failed:
        print("  FAILED", pid, err)

    if args.zip:
        os.makedirs(DIST, exist_ok=True)
        zp = os.path.join(DIST, "anori-pack.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(SOURCE, "anori-grid/plugin.js")
            for pid, _ in built:
                for f in ("plugin.js", "README.md"):
                    z.write(os.path.join(PACK, pid, f), f"{pid}/{f}")
        print(f"zip: {zp} ({os.path.getsize(zp)} байт)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
