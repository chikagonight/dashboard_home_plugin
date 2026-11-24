# Hermes Dashboard Home Plugin (Anori Grid)

Отдельный проект: Anori-подобная Home-страница для Hermes Desktop. Половина
Desktop — один plain-ESM файл `desktop/plugin.js`, без сборки и без Python.
`IDEA.md` — цель и состояние, `README.md` — установка и виджеты.

## Среда

- Windows Hermes Desktop → WSL-бэкенд (`hermes 0.23.3`, ревизия `caafe5389ae5`).
- Нативный renderer грузит standalone-плагины из
  `C:\Users\<user>\AppData\Local\hermes\desktop-plugins\<id>\plugin.js`
  (из WSL: `/mnt/c/...`), а НЕ из `HERMES_HOME` бэкенда. КОРРЕКТНЫЙ id берётся
  из `name:` в `plugin.yaml` — имя папки проекта с ним не связано.
- Перед правками SDK сверяй исходники установленной ревизии
  (`apps/desktop/src/sdk/index.ts`, `apps/desktop/src/contrib/plugin.ts`,
  `apps/desktop/src/lib/keybinds/actions.ts`), а не память и не свежий upstream.

## Команды

- `./check.sh` — проверка пакета: манифест, `node --check` desktop-половины,
  `bash -n sync.sh`, `hermes plugins validate . --json`, три сценария `sync.sh`
  в изолированном `HOME`. Это единственный канонический прогон проекта.
- `python3 scripts/make_pack.py --zip` — сборка отдельных виджетов в `pack/`
  и `dist/anori-pack.zip` (артефакты, в Git не входят).
- `./sync.sh` — копирование исходника в обнаруженные живые корни загрузки
  (`ANORI_LIVE=<путь>` — явная цель, `ANORI_NO_AUTO=1` — только она).

## Правила

- Источник истины — `desktop/plugin.js` с маркерами `[HELPER]` и
  `[WIDGET <id>]`; `pack/**` производные и не правятся вручную.
- В плагине доступны импорты только `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime`; JSX-синтаксис не работает — только `jsx()`. Цвета и
  фоны — из theme-переменных (`var(--ui-*)`), никаких хардкод-цветов в UI
  (в CSS-градиентах тем — осознанное исключение, это палитры самой страницы).
- Внешняя ссылка идёт через `ctx.os.openExternal` с проверкой возврата и
  fallback на `window.open`; встраивание страниц — только `SandboxedFrame`
  (`http(s)`/`data:`), без `<webview>` и без DOM-доступа к разметке приложения.
- Данные виджетов и layout — в `ctx.storage`; таймеры и подписки регистрировать
  через `ctx.setInterval`/`ctx.onEvent`/`ctx.onDispose`, чтобы они не пережили
  выгрузку плагина.
- Не устанавливать в рабочий профиль, не перезапускать бэкенд или Desktop и не
  публиковать репозиторий без явного согласования с владельцем.
