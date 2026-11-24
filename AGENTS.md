# Hermes Dashboard Home Plugin (Anori Grid)

Отдельный проект: Anori-подобная Home-страница для Hermes Desktop. Половина
Desktop — один plain-ESM файл `desktop/plugin.js` (1140 строк, 32 виджета), без
сборки и без Python-бэкенда. `IDEA.md` — цель и состояние, `README.md` — установка
и виджеты, `CHANGELOG.md` — версии.

## Среда

- Windows Hermes Desktop → WSL-бэкенд (`hermes 0.23.3`, ревизия `caafe5389ae5`).
  В PATH нужны `hermes`, `node` (v22), `python3` (3.14) — их зовёт `check.sh`.
- id плагина — `anori-grid` (из `name:` в `plugin.yaml`), путь страницы — `/anori`,
  манифест: `manifest_version: 2`, `api_version: 1`, `requires_hermes: ">=0.23"`.
- Нативный renderer грузит standalone-плагины из
  `C:\Users\<user>\AppData\Local\hermes\desktop-plugins\<id>\plugin.js`
  (из WSL: `/mnt/c/...`), а НЕ из `HERMES_HOME` бэкенда. КОРРЕКТНЫЙ id берётся
  из `name:` в `plugin.yaml` — имя папки проекта с ним не связано.
- Живая копия подхватывается на сохранение; если панель не появилась —
  Ctrl+K / ⌘K → «Reload desktop plugins» (это есть в `controller.tsx:336`),
  перезапуск Desktop не нужен.
- Перед правками SDK сверяй исходники установленной ревизии
  (`~/.hermes/hermes-agent/apps/desktop/src/sdk/index.ts`, `src/sdk/areas.ts`,
  `src/contrib/plugin.ts`, `src/app/contrib/controller.tsx`), а не память и не
  свежий upstream.

## Команды

- `bash check.sh` — проверка пакета: манифест, `node --check` desktop-половины,
  `bash -n sync.sh`, `hermes plugins validate . --json`, три сценария `sync.sh`
  в изолированном `HOME`. Это единственный канонический прогон проекта; итог —
  `verify: ALL PASS`, выход != 0 при любом FAIL. У `check.sh` нет exec-бита,
  поэтому `./check.sh` даёт «Permission denied» (`chmod +x check.sh` — по желанию).
- `python3 scripts/make_pack.py --zip` — сборка 32 отдельных виджетов в `pack/`
  (`pack/anori-<widget>/plugin.js` + README) и `dist/anori-pack.zip`; без `--zip`
  только `pack/`. Артефакты в Git не входят (`.gitignore`: `pack/`, `dist/`).
- `./sync.sh` — копирование исходника в обнаруженные живые корни загрузки
  (`ANORI_LIVE=<путь>` — явная цель, `ANORI_NO_AUTO=1` — только она).
- Других тестов, линтера и сборки в репозитории нет.

## Устройство `desktop/plugin.js`

```
1–17     импорты + ID/PAGE/COLS/ROW/STORE
19–95    [HELPER] … [/HELPER]   e(), uid/clamp/esc, $now+startNow, obj/arr, getJSON/getText, useFetch, Net
97–221   const CSS — единый шаблон, классы с префиксом ag-
222–241  THEMES, WALLS
242–931  32 блока [WIDGET <id>] … [/WIDGET] с def({...})
932–1112 TileBody, defaultDoc, cfgOf, App (сетка, папки, drag/resize, модалки)
1113–1140 export default { id, name, register(ctx) }
```

## Правила

- Источник истины — `desktop/plugin.js` с маркерами `[HELPER]` и
  `[WIDGET <id>]`; `pack/**` производные и не правятся вручную.
- Виджет = один `def({ type, label, glyph, w, h, hint, cfg, render(env) })` внутри
  своей пары маркеров; `def` сам кладёт тип в `WIDGETS` и в `ORDER` (порядок
  диалога «добавить виджет»). Тело рендерит только `render(env)`,
  `env = { ctx, cfg, set, edit, open, tile, host }`, правки конфига — исключительно
  через `env.set(patch)`; дефолты берутся из `cfg`, слияние — `cfgOf`.
- Тело плитки всегда обёрнуто в `.ag-body`; классы CSS — с префиксом `ag-`.
- В плагине доступны импорты только `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime`; JSX-синтаксис не работает — только `jsx()` / хелпер `e()`.
  Цвета и фоны — из theme-переменных (`var(--ui-*)`), никаких хардкод-цветов в UI
  (в CSS-градиентах тем — осознанное исключение, это палитры самой страницы).
- Внешняя ссылка идёт через `ctx.os.openExternal` с проверкой возврата и
  fallback на `window.open`; встраивание страниц — только `SandboxedFrame`
  (`http(s)`/`data:`), без `<webview>` и без DOM-доступа к разметке приложения.
- Данные виджетов и layout — в `ctx.storage`: страница — ключ `doc.v1`
  (`STORE`), pack-виджет — `cfg.v1` (`scripts/pack_host.js`).
- Таймеры и подписки регистрировать через `ctx.setInterval`/`ctx.onEvent`/
  `ctx.onDispose`, чтобы они не пережили выгрузку плагина (подписка вне
  `register()` сама не снимается). Общий тикер времени — `startNow()` +
  `$now` (atom), снятый в `ctx.onDispose`; свой `setInterval` на плитку не заводить.
- Сети требуют лишь `weather` (api.open-meteo.com), `rss` (адрес фида) и
  `palette` (thecolorapi.com); такие виджеты оборачивают вывод в `Net` и показывают
  ошибку вместо падения плитки.
- Не устанавливать в рабочий профиль, не перезапускать бэкенд или Desktop и не
  публиковать репозиторий без явного согласования с владельцем.

## Pitfalls

- Синтаксис проверяют через пробу `.mjs` (`check.sh`, `make_pack.py`): в репозитории
  нет `package.json`/`type: module`, а определение ESM по расширению включено только
  в Node ≥ 22.12 (здесь v22.22.1 — `node --check plugin.js` случайно проходит,
  на более старом Node падает с SyntaxError).
- `make_pack.py` ищет **парные** маркеры: виджет без `// ===== [/WIDGET] =====`
  не попадёт в `pack/`, а отсутствие `[/HELPER]` или блока `const CSS` — выход с
  ошибкой «нечего собирать».
- `sync.sh` пишет во **все** найденные корни сразу (`$HOME/.hermes` + каждый
  `/mnt/c/Users/*/AppData/Local/hermes`), поэтому реальные прогоны — только с
  изолированным `HOME` или `ANORI_NO_AUTO=1 ANORI_LIVE=…`; в `check.sh` цели
  подменяются `sed`-копией скрипта в tmp.
- `prompt()`/`alert()` в окне Desktop недоступны — переименование папки и
  удаление сделаны инлайн-элементами в режиме «правки».
- `ctx.os.openExternal` возвращает `false` вне нативного Desktop (web-дашборд), а
  `SandboxedFrame` пуст на сайтах с `X-Frame-Options`/`frame-ancestors`
  (Google, GitHub) — для них только открытие в браузере.
- `homepage:` в `plugin.yaml` закомментирован: нужен только для карточки
  каталога, установка из Git работает без него.
