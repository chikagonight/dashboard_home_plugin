# Anori Grid — стартовая страница для Hermes Desktop

Плагин Hermes Desktop в духе расширения [Anori](https://anori.app): своя
Home-страница внутри приложения, собранная из виджетов.

- сетка 12 колонок: перетаскивание за заголовок, ресайз за правый нижний угол;
- папки (рабочий / личный контекст), переключение в один клик;
- 8 акцентных тем и фоны, своя картинка по URL;
- 32 виджета, layout и конфиги хранятся в `ctx.storage` плагина;
- **ссылки открываются в системном браузере** через `ctx.os.openExternal`
  (fallback — `window.open`); отдельные страницы встраиваются через `SandboxedFrame`.

## Установка из Git

```bash
hermes plugins install <owner>/hermes-anori-grid
# или полным URL:
hermes plugins install https://github.com/<owner>/hermes-anori-grid
```

Затем включи: **Capabilities → Plugins → Anori Grid**. После включения в сайдбаре
появится строка **Anori**, в ⌘K / Ctrl+K — команда «Anori: открыть страницу»,
в статус-баре — чип «◧ Anori».

### Структура пакета

```
plugin.yaml         манифест (name/version/description, requires_hermes)
desktop/plugin.js   половина Desktop — один plain-ESM файл, без сборки
```

Приложение копирует `desktop/plugin.js` в свой корень загрузки
(`%LOCALAPPDATA%\hermes\desktop-plugins\anori-grid\` на Windows,
`~/.hermes/desktop-plugins/anori-grid/` на Linux/macOS).

## Структура репозитория

```
plugin.yaml         манифест (name/version/description, requires_hermes)
desktop/plugin.js   половина Desktop — один plain-ESM файл, без сборки
scripts/pack_host.js, scripts/make_pack.py   сборка отдельных виджетов
check.sh            локальная проверка пакета (без сети и без Desktop)
sync.sh             копирование исходника в живой корень загрузки
IDEA.md             цель, состояние, план проекта
pack/  dist/        артефакты сборки (в Git не входят)
```

## Проверка

```bash
./check.sh                                    # манифест, desktop half, sync.sh
python3 scripts/make_pack.py --zip            # pack/anori-* + dist/anori-pack.zip
./sync.sh                                     # исходник -> живой desktop-plugins
```

`ANORI_LIVE=<путь>` добавляет явную цель для `sync.sh`, `ANORI_NO_AUTO=1`
отключает автопоиск корней.

## Разработка без установки

Положи файл прямо в корень загрузки — приложение следит за этой папкой и
перезагружает плагин на каждое сохранение:

```bash
mkdir -p ~/.hermes/desktop-plugins/anori-grid
cp desktop/plugin.js ~/.hermes/desktop-plugins/anori-grid/plugin.js
```

Если панель не появилась: ⌘K / Ctrl+K → «Reload desktop plugins».

## Отдельные виджеты

`scripts/make_pack.py` собирает из виджетов источника 32 самостоятельных
плагина (`pack/anori-<widget>/` с `plugin.js` + README и архив
`dist/anori-pack.zip`): каждый регистрирует панель в правой колонке
(`PANES_AREA`) и команду палитры, конфиг держит в `ctx.storage`. Правки
вносятся в `desktop/plugin.js` и пересобираются — файлы в `pack/` производные.

## Виджеты

| группа | виджеты |
|---|---|
| контент | links, embedded, notes, tasks, sticky, routine, journal, flashcards, snippet, quote |
| время | clock, worldtime, calendar, countdown, dayprogress, yearprogress, lifeprogress, pomodoro, habit, mood |
| данные и инструменты | search, calc, converter, wordcount, dice, roulette, palette, status, usage, weather, rss, goals |

Внешняя сеть нужна только `weather` (api.open-meteo.com), `rss` (адрес фида) и
`palette` (thecolorapi.com); остальные виджеты работают локально. Сетевые
показывают состояние ошибки вместо падения плитки.

## Настройка

Режим «правка» → ⚙ на плитке → JSON конфига. Например, для `weather`:

```json
{ "city": "Saint Petersburg", "lat": 59.9386, "lon": 30.3141 }
```

Папки: в режиме «правки» вкладка папки становится полем имени, крестик удаляет
папку (последнюю удалить нельзя).

## Ограничения

- `SandboxedFrame` принимает только `http(s)`/`data:`; сайты с
  `X-Frame-Options`/`frame-ancestors` (Google, GitHub) показываются пустыми —
  для них используй открытие в браузере.
- `ctx.os.openExternal` возвращает `false` вне нативного Desktop (web-дашборд) —
  плагин в этом случае падает на `window.open`.
- Это Desktop-половина без Python-бэкенда: данные берутся из gateway RPC
  (`host.state.*`) и из локального хранилища плагина.

## Лицензия

MIT. Идея и набор виджетов вдохновлены Anori (`OlegWock/anori`, AGPL-3.0);
код написан заново и производным не является.
