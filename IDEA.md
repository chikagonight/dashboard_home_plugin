## Цель

Anori-подобная стартовая страница (Home-дашборд) как самостоятельный плагин
Hermes Desktop, устанавливаемый из Git: сетка виджетов с перетаскиванием,
папки, темы, открытие ссылок в системном браузере. Критерий приёмки — плагин
ставится из репозитория штатным менеджером и работает без сборки.

## Текущее состояние

`plugin.yaml` 0.1.0 (desktop half: `desktop/plugin.js`, 1140 строк, 32 виджета).
`hermes plugins validate` → `ok: true`, 13/13, `security scan: safe`.
Установка из Git проверена в изолированном `HERMES_HOME`. Живая копия для
Windows Desktop лежит в `C:\Users\weed\AppData\Local\hermes\desktop-plugins\anori-grid\plugin.js`
(standalone-файл, совпадает с исходником по SHA-256) — это результат разработки,
а не managed-установка.
Публикация выполнена: remote `git@github.com:chikagonight/dashboard_home_plugin.git`
(публичный репозиторий, ветка `main`) содержит HEAD `51c299b`; `pack/` и `dist/`
не входят (`.gitignore`), в tree 11 верхнеуровневых путей.

## План и этапы

1. Источник истины — `desktop/plugin.js`; правки только в него, затем `./sync.sh`
   в живой корень и `./check.sh` для проверки пакета.
2. Отдельные виджеты собирает `python3 scripts/make_pack.py [--zip]` из блоков
   с маркерами `[WIDGET <id>]`; каталоги `pack/` и `dist/` — артефакты, в Git не входят.
3. Публикация: remote заведён и `main` запушен (2026-11-24). Осталось: вписать
   `homepage` в `plugin.yaml` и проверить `hermes plugins install
   chikagonight/dashboard_home_plugin` на нативном Windows Desktop.
4. Заявка в каталог Hermes (правила Admission, README с disclosure о сети) — после
   того как установка из Git подтверждена на обеих сторонах.

## Выполнено

- Демо собрано и подтверждено в живом окне Desktop: сетка, папки, drag/resize,
  ссылки открываются в браузере (`ctx.os.openExternal`, fallback `window.open`),
  встраивание страниц через `SandboxedFrame`.
- Исправлено по замечанию владельца: контент виджетов был вне контейнера с
  полями (прижимался к рамке плитки) — теперь общая `.ag-body` 12px; ссылки
  растягиваются по ширине плитки (`auto-fit`); папки получают переименование
  инлайн-полем и удаление крестиком вместо недоступного в Desktop `prompt()`.
- `sync.sh`: id плагина читается из `plugin.yaml`, поиск корней без хардкода
  имени пользователя (`/mnt/c/Users/*/…`), рабочая ветка отказа
  (`ANORI_NO_AUTO=1` и пустой `name:`). Ошибка сборки этих двух пунктов была
  найдена ad-hoc проверкой и устранена; дублирующая папка `hermes-anori-grid`
  из живого корня удаления подтверждена (`ls` → anori-grid, quota, sidebar-manager).
- Проверка пакета закреплена командой `./check.sh` (манифест, `node --check`,
  `bash -n`, `hermes plugins validate`, три сценария `sync.sh` в изолированном
  `HOME`); последний прогон — `verify: ALL PASS`, 10/10.
- Пак отдельных виджетов пересобран из текущего источника в этом проекте:
  32 плагина, 9580 строк, архив `dist/anori-pack.zip` (245 489 байт).
  Прежние копии в `~/.hermes/cache/scratch/` удалены как дубли.
- История Git перенесена целиком (4 коммита, ветка `main`) из
  `~/projects/hermes-anori-grid` в `~/projects/hermes_plugins/dashboard_home_plugin`.
- Репозиторий опубликован на GitHub (push -u origin main): `git ls-remote` и
  Contents API подтверждают `main` на SHA HEAD и 11 верхнеуровневых путей;
  `check.sh` перед push — `verify: ALL PASS`.

## Следующий шаг

Проверить `hermes plugins install chikagonight/dashboard_home_plugin` из GitHub на
нативном Windows Desktop с последующим включением в Capabilities → Plugins; при
успехе удалить standalone-файл в `desktop-plugins`, чтобы не держать две копии
плагина. До этого — вписать `homepage` в `plugin.yaml` (сейчас закомментирован).
