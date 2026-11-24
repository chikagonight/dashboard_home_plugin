// Хост одного виджета: добавляется генератором make_pack.py к каждому
// виджету из desktop/plugin.js, чтобы получился самостоятельный плагин.
// Ожидает в файле: ID, CSS, helpers (e, arr, obj, useFetch, Net, startNow,
// nowTimer, $now), DEF (описание виджета), импорты PANES_AREA/PALETTE_AREA.
const STORE = 'cfg.v1'
const DefBody = ({ def, env }) => def.render(env)

function Widget({ ctx, wdef }) {
  const [cfg, setCfg] = useState(() => Object.assign({}, wdef.cfg, ctx.storage.get(STORE, {}) || {}))
  const [edit, setEdit] = useState(false)
  const [raw, setRaw] = useState(null)
  const url = (u) => {
    if (!u) return
    if (!/^https?:\/\//i.test(String(u))) { host.notify({ kind: 'error', message: 'только http(s)' }); return }
    const fb = () => { try { window.open(String(u), '_blank', 'noopener,noreferrer') } catch { host.notify({ kind: 'error', message: 'браузер не открылся' }) } }
    if (ctx.os && ctx.os.openExternal) ctx.os.openExternal(String(u)).then((ok) => { if (!ok) fb() }, fb)
    else fb()
  }
  const env = { ctx, cfg, edit, open: url, host, set: (p) => {
    const add = typeof p === 'function' ? p(cfg) : p
    const next = Object.assign({}, cfg, add)
    setCfg(next)
    try { ctx.storage.set(STORE, next) } catch { host.notify({ kind: 'error', message: 'не удалось сохранить' }) }
  } }
  return e('div', { className: 'ag', 'data-edit': edit, style: { '--ag-accent': '#6fbf9a', '--ag-on': '#06251a',
      '--ag-card': 'color-mix(in srgb,#000000 22%,transparent)', '--ag-wall': 'transparent', '--ag-veil': 'none' } },
    e('div', { className: 'ag-row', style: { margin: '2px 0 8px' } },
      e('b', null, wdef.glyph + '  ' + wdef.label),
      e('span', { className: 'ag-tiny', style: { marginLeft: 8 } }, wdef.hint || 'локально, без сети'),
      e('button', { className: 'ag-btn', style: { marginLeft: 'auto' }, 'data-on': edit, onClick: () => setEdit(!edit) }, edit ? 'готово' : 'правка'),
      e('button', { className: 'ag-btn', onClick: () => setRaw(JSON.stringify(cfg, null, 1)) }, 'json')),
    e('div', { className: 'ag-tile' },
      e('div', { className: 'ag-body', style: { minHeight: Math.max(120, (wdef.h || 3) * 44) } }, e(DefBody, { def: wdef, env }))),
    raw != null ? e('div', { className: 'ag-modal', onClick: () => setRaw(null) },
      e('div', { className: 'ag-sheet', onClick: (ev) => ev.stopPropagation() },
        e('h3', null, 'Конфиг · ' + wdef.label),
        e(Textarea, { className: 'ag-ta', style: { minHeight: 240 }, value: raw, onChange: (ev) => setRaw(ev.target.value) }),
        e('div', { className: 'ag-row', style: { marginTop: 8 } },
          e('button', { className: 'ag-btn', onClick: () => { try { setCfg(JSON.parse(raw)); setRaw(null); host.notify({ kind: 'info', message: 'применено' }) } catch (err) { host.notify({ kind: 'error', message: 'битый JSON: ' + err.message }) } } }, 'применить'),
          e('button', { className: 'ag-btn', onClick: () => setRaw(null) }, 'закрыть')))) : null)
}

export default {
  id: ID,
  name: 'Anori · ' + DEF.label,
  description: 'Anori-виджет «' + DEF.label + '» отдельным плагином Hermes Desktop: панель в макете + команда палитры.',
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    ctx.onDispose(() => style.remove())
    startNow()
    ctx.onDispose(() => { if (nowTimer) clearInterval(nowTimer); nowTimer = null })
    ctx.register({
      id: 'pane', area: PANES_AREA, title: DEF.label,
      data: { placement: 'right', width: '340px' },
      render: () => jsx(Widget, { ctx, wdef: DEF })
    })
    ctx.register({
      id: 'cmd', area: PALETTE_AREA,
      data: { id: ID + '.focus', label: 'Anori: ' + DEF.label, keywords: ['anori', ID],
        run: () => host.notify({ kind: 'info', message: 'Anori · ' + DEF.label + ' — панель в правой колонке' }) }
    })
  }
}
