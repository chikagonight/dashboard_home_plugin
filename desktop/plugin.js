// Anori-style start page for Hermes Desktop.
// One plain-ESM file: folders, a drag + resize widget grid, 32 widgets,
// per-folder accent themes and wallpapers, everything persisted in ctx.storage.
// Links open in the OS browser through ctx.os.openExternal; pages can also be
// embedded in-place with SandboxedFrame. No build step, no backend package.
import {
  atom, Button, cn, host, Input, PALETTE_AREA, ROUTES_AREA, SandboxedFrame,
  SIDEBAR_NAV_AREA, STATUSBAR_AREAS, Textarea, Tip, useValue
} from '@hermes/plugin-sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'anori-grid'
const PAGE = '/anori'
const COLS = 12
const ROW = 58
const STORE = 'doc.v1'

// ===== [HELPER] =====
const e = (type, props, ...kids) => jsx(type, {
  ...(props || {}),
  children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids
})

const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const pad = (n) => String(n).padStart(2, '0')
const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes())
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Small local clock heartbeat shared by every time widget (min 1s, 5s in
// background) so a page never spins its own interval per tile.
const $now = atom(Date.now())
let nowTimer = null
function startNow() {
  if (nowTimer) clearInterval(nowTimer)
  nowTimer = setInterval(() => $now.set(Date.now()), 1000)
}

// JSON-ish config helpers: widgets keep plain data, so a bad paste can never
// crash the grid.
const obj = (v, fallback) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fallback)
const arr = (v) => (Array.isArray(v) ? v : [])

async function getJSON(url, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), ms || 9000) : null
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, referrerPolicy: 'no-referrer' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } finally { if (timer) clearTimeout(timer) }
}

async function getText(url, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), ms || 9000) : null
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, referrerPolicy: 'no-referrer' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.text()
  } finally { if (timer) clearTimeout(timer) }
}

const fav = (url) => {
  try { return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico' }
  catch { return '' }
}
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const domain = (u) => { try { return new URL(u).hostname } catch { return '' } }

// Live fetch state shared by network widgets: idle -> loading -> ok | error.
function useFetch(loader, deps, everyMs) {
  const [st, setSt] = useState({ phase: 'loading', data: null, error: '' })
  useEffect(() => {
    let alive = true
    setSt((s) => ({ ...s, phase: 'loading' }))
    const run = () => loader().then(
      (data) => alive && setSt({ phase: 'ok', data, error: '' }),
      (err) => alive && setSt({ phase: 'error', data: null, error: String(err && err.message || err) })
    )
    run()
    const t = everyMs ? setInterval(run, everyMs) : null
    return () => { alive = false; if (t) clearInterval(t) }
  }, deps)
  return st
}

const Net = ({ st, children, hint }) => st.phase === 'loading'
  ? e('div', { className: 'ag-load' }, 'loading…')
  : st.phase === 'error'
    ? e('div', { className: 'ag-err' }, e('b', null, 'нет связи'), e('span', null, st.error), hint ? e('i', null, hint) : null)
    : children
// ===== [/HELPER] =====

// ---------------------------------------------------------------- CSS
const CSS = `
.ag{position:relative;min-height:100%;padding:18px 20px 34px;color:var(--ui-text-primary);
  background:var(--ag-wall);background-size:cover;background-position:center;overflow:auto}
.ag::before{content:"";position:absolute;inset:0;pointer-events:none;background:var(--ag-veil)}
.ag-inner{position:relative;z-index:1}
.ag-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.ag-title{font-size:15px;font-weight:600;letter-spacing:.02em;margin-right:2px}
.ag-hello{font-size:12px;color:var(--ui-text-secondary);margin-right:auto}
.ag-tabs{display:flex;gap:4px;flex-wrap:wrap}
.ag-tab{padding:3px 10px;border-radius:999px;font-size:12px;cursor:pointer;
  border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-secondary);background:transparent}
.ag-tab[data-on=true]{border-color:var(--ag-accent);color:var(--ag-accent);
  background:color-mix(in srgb,var(--ag-accent) 14%,transparent)}
.ag-tab-edit{display:inline-flex;align-items:center;gap:2px;padding:3px 5px 3px 9px}
.ag-tabname{width:9ch;min-width:0;border:0;background:transparent;color:inherit;font:inherit;
  font-size:12px;padding:0;text-align:center}
.ag-tabname:focus{outline:none}
.ag-tabx{border:0;background:transparent;color:var(--ui-text-quaternary);cursor:pointer;
  font-size:14px;line-height:1;padding:0 3px;border-radius:4px}
.ag-tabx:hover{color:var(--ag-accent)}
.ag-tabx[disabled]{opacity:.28;cursor:not-allowed}
.ag-grid{display:grid;grid-template-columns:repeat(${COLS},minmax(0,1fr));grid-auto-rows:${ROW}px;gap:12px}
.ag-tile{position:relative;display:flex;flex-direction:column;min-height:0;overflow:hidden;border-radius:14px;
  border:1px solid var(--ui-stroke-secondary);background:var(--ag-card);backdrop-filter:blur(10px);
  box-shadow:0 1px 0 color-mix(in srgb,var(--ag-accent) 12%,transparent)}
.ag-tile[data-drag=true]{opacity:.35}
.ag-tile[data-over=true]{outline:1px dashed var(--ag-accent);outline-offset:2px}
.ag-hd{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:10px 12px 0;font-size:11px;
  color:var(--ui-text-quaternary);text-transform:uppercase;letter-spacing:.08em;flex:0 0 auto}
.ag-hd .ag-glyph{font-size:12px;filter:saturate(.8)}
.ag-tools{margin-left:auto;display:none;gap:2px;align-items:center}
.ag[data-edit=true] .ag-tools{display:flex}
.ag-tool{border:0;background:transparent;color:var(--ui-text-quaternary);cursor:pointer;
  font:inherit;font-size:11px;padding:1px 4px;border-radius:4px;line-height:1.2}
.ag-tool:hover{color:var(--ag-accent);background:color-mix(in srgb,var(--ag-accent) 12%,transparent)}
.ag-body{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;gap:4px;overflow:auto;
  padding:4px 12px 12px;font-size:13px;line-height:1.5;scrollbar-width:thin;scrollbar-gutter:stable}
.ag-body::-webkit-scrollbar{width:8px}.ag-body::-webkit-scrollbar-thumb{background:var(--ui-stroke-secondary);border-radius:8px}
.ag-grip{position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;opacity:0}
.ag[data-edit=true] .ag-grip{opacity:.7}
.ag-grip::after{content:"";position:absolute;right:3px;bottom:3px;width:8px;height:8px;
  border-right:2px solid var(--ag-accent);border-bottom:2px solid var(--ag-accent)}
.ag-add{border-style:dashed;align-items:center;justify-content:center;color:var(--ui-text-tertiary);
  cursor:pointer;background:transparent;min-height:96px;font-size:22px}
.ag-add:hover{color:var(--ag-accent);border-color:var(--ag-accent)}
.ag-sheet .ag-row{gap:8px}
.ag-row{display:flex;align-items:center;gap:6px}
.ag-num{font-variant-numeric:tabular-nums;font-family:var(--font-mono,monospace)}
.ag-big{font-size:clamp(22px,5vw,42px);font-weight:300;letter-spacing:-.02em;line-height:1.05}
.ag-mid{font-size:20px;font-weight:400;line-height:1.15}
.ag-dim{color:var(--ui-text-tertiary)}
.ag-tiny{font-size:11px;color:var(--ui-text-quaternary)}
.ag-pill{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;
  border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-secondary)}
.ag-bar{height:5px;border-radius:999px;background:color-mix(in srgb,var(--ag-accent) 16%,transparent);overflow:hidden}
.ag-bar>i{display:block;height:100%;background:var(--ag-accent);border-radius:999px;transition:width .4s}
.ag-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.ag-li{display:flex;align-items:flex-start;gap:6px;padding:2px 0}
.ag-li input[type=checkbox]{margin-top:3px;accent-color:var(--ag-accent)}
.ag-li[data-done=true]{color:var(--ui-text-quaternary);text-decoration:line-through}
.ag-x{margin-left:auto;border:0;background:none;color:var(--ui-text-quaternary);cursor:pointer;font-size:13px}
.ag-x:hover{color:var(--ag-accent)}
.ag-in,.ag-ta{width:100%;box-sizing:border-box;font:inherit;font-size:12px;color:inherit;
  background:transparent;border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:5px 7px}
.ag-in:focus,.ag-ta:focus{outline:none;border-color:var(--ag-accent)}
.ag-ta{min-height:64px;resize:vertical;font-family:var(--font-mono,monospace)}
.ag-btn{border:1px solid var(--ui-stroke-secondary);background:transparent;color:var(--ui-text-secondary);
  font:inherit;font-size:11px;padding:3px 8px;border-radius:7px;cursor:pointer}
.ag-btn:hover{color:var(--ag-accent);border-color:var(--ag-accent)}
.ag-btn[data-on=true]{color:var(--ag-accent);border-color:var(--ag-accent);
  background:color-mix(in srgb,var(--ag-accent) 14%,transparent)}
.ag-chips{display:flex;gap:4px;flex-wrap:wrap}
.ag-links{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))}
.ag-link .ag-fb{font-size:13px}
.ag-link{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:10px;
  border:1px solid transparent;cursor:pointer;text-align:center;min-width:0}
.ag-link:hover{border-color:var(--ag-accent);background:color-mix(in srgb,var(--ag-accent) 10%,transparent)}
.ag-link img,.ag-link .ag-fb{width:22px;height:22px;border-radius:5px;object-fit:contain;
  background:color-mix(in srgb,var(--ag-accent) 18%,transparent);
  display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--ag-accent)}
.ag-link span{font-size:11px;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:11px;text-align:center}
.ag-cal b{font-weight:500;color:var(--ui-text-quaternary)}
.ag-cal i{font-style:normal;padding:4px 0;border-radius:6px;color:var(--ui-text-secondary)}
.ag-cal i[data-today=true]{background:var(--ag-accent);color:var(--ag-on)}
.ag-frame{width:100%;height:100%;min-height:120px;border:0;border-radius:8px;background:#0000}
.ag-mono{font-family:var(--font-mono,monospace);font-size:12px;white-space:pre-wrap;word-break:break-word}
.ag-load,.ag-err{font-size:12px;color:var(--ui-text-tertiary);display:flex;flex-direction:column;gap:2px}
.ag-err b{color:var(--ag-accent)}.ag-err i{font-style:normal;font-size:11px;color:var(--ui-text-quaternary)}
.ag-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.ag-key{padding:8px 0;text-align:center;border-radius:8px;border:1px solid var(--ui-stroke-secondary);
  cursor:pointer;font-family:var(--font-mono,monospace);font-size:14px}
.ag-key:hover{border-color:var(--ag-accent);color:var(--ag-accent)}
.ag-key[data-wide=true]{grid-column:span 2}
.ag-key[data-acc=true]{color:var(--ag-accent);border-color:var(--ag-accent)}
.ag-strip{display:flex;gap:6px;overflow:auto;padding-bottom:4px;scrollbar-width:none}
.ag-strip::-webkit-scrollbar{display:none}
.ag-card{flex:0 0 auto;width:132px;border-radius:10px;overflow:hidden;border:1px solid var(--ui-stroke-secondary);cursor:pointer}
.ag-card .ag-cardh{height:52px;background:color-mix(in srgb,var(--ag-accent) 16%,transparent)}
.ag-card p{margin:0;padding:7px 9px;font-size:11px;line-height:1.35}
.ag-mood{display:flex;gap:4px;flex-wrap:wrap}
.ag-mood button{width:26px;height:26px;border-radius:50%;border:1px solid var(--ui-stroke-secondary);
  background:transparent;cursor:pointer;color:var(--ui-text-secondary);font-size:13px}
.ag-mood button[data-on=true]{border-color:var(--ag-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--ag-accent) 30%,transparent)}
.ag-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.45);padding:16px}
.ag-sheet{width:min(680px,100%);max-height:82vh;overflow:auto;border-radius:16px;padding:14px;
  background:var(--ag-card-solid,var(--ag-card));border:1px solid var(--ui-stroke-secondary);backdrop-filter:blur(16px)}
.ag-sheet h3{margin:0 0 10px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ui-text-secondary)}
.ag-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
.ag-pick button{display:flex;flex-direction:column;gap:2px;padding:8px;border-radius:10px;text-align:left;
  border:1px solid var(--ui-stroke-secondary);background:transparent;cursor:pointer;color:var(--ui-text-secondary);font-size:12px}
.ag-pick button:hover{border-color:var(--ag-accent);color:var(--ag-accent)}
.ag-pick small{font-size:10px;color:var(--ui-text-quaternary)}
.ag-set{display:flex;flex-direction:column;gap:8px}
.ag-set label{font-size:11px;color:var(--ui-text-quaternary);text-transform:uppercase;letter-spacing:.07em}
.ag-quote{font-size:14px;line-height:1.5;font-style:italic}
.ag-hrs{display:flex;flex-direction:column;gap:2px;font-size:12px}
.ag-hrs .ag-row{justify-content:space-between}
.ag-w{display:flex;align-items:center;gap:10px}
.ag-w .ag-deg{font-size:34px;font-weight:300;line-height:1}
.ag-rain{font-size:11px;color:var(--ui-text-tertiary);margin-top:6px}
`

// ---------------------------------------------------------------- themes
const THEMES = {
  moss: { label: 'Moss', accent: '#6fbf9a', on: '#06251a', wall: 'radial-gradient(1200px 600px at 12% -10%,#12352a 0%,#0a1a16 55%,#06110f 100%)' },
  dune: { label: 'Dune', accent: '#e0b176', on: '#2a1b08', wall: 'radial-gradient(1000px 620px at 85% 0%,#3a2a17 0%,#1d1610 60%,#120d0a 100%)' },
  ice: { label: 'Ice', accent: '#8ab6ff', on: '#071627', wall: 'linear-gradient(160deg,#0f1e33 0%,#0b1422 55%,#070d16 100%)' },
  rose: { label: 'Rose', accent: '#ef8fb2', on: '#2c0a17', wall: 'radial-gradient(900px 600px at 20% 110%,#3a1526 0%,#1a0d14 60%,#100810 100%)' },
  amber: { label: 'Amber', accent: '#f0a44a', on: '#2a1703', wall: 'linear-gradient(150deg,#2a1a08 0%,#171007 60%,#0d0906 100%)' },
  slate: { label: 'Slate', accent: '#9fb0c4', on: '#0d1319', wall: 'linear-gradient(150deg,#161c24 0%,#0e1319 60%,#090c10 100%)' },
  paper: { label: 'Paper', accent: '#2f7d5c', on: '#f5f5ef', wall: 'linear-gradient(160deg,#eef0e9 0%,#e4e7de 60%,#d9dccf 100%)' },
  neon: { label: 'Neon', accent: '#7af0ff', on: '#03212a', wall: 'radial-gradient(800px 500px at 80% 20%,#123a4d 0%,#0a1a2b 55%,#05080f 100%)' }
}
const WALLS = {
  none: { label: 'Theme default', url: '' },
  grid: { label: 'Grid', url: 'repeating-linear-gradient(0deg,#ffffff08 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,#ffffff08 0 1px,transparent 1px 28px)' },
  dusk: { label: 'Dusk', url: 'linear-gradient(200deg,#241a3a,#0e1526 55%,#050a12)' },
  forest: { label: 'Forest', url: 'linear-gradient(180deg,#0c2a22,#061513)' },
  sea: { label: 'Sea', url: 'linear-gradient(180deg,#0b2740,#061424)' },
  clay: { label: 'Clay', url: 'linear-gradient(180deg,#3b2317,#1a100b)' }
}

// ---------------------------------------------------------------- widgets
const WIDGETS = {}
const reg = (d) => { WIDGETS[d.type] = d }
const ORDER = []
const def = (d) => { reg(d); ORDER.push(d.type) }

// ===== [WIDGET links] =====
def({
  type: 'links', label: 'Links', glyph: '🔗', w: 4, h: 3,
  hint: 'Открывает в системном браузере',
  cfg: { items: [
    { t: 'Gmail', u: 'https://mail.google.com' }, { t: 'GitHub', u: 'https://github.com' },
    { t: 'Hermes docs', u: 'https://hermes-agent.nousresearch.com/docs' },
    { t: 'YouTube', u: 'https://youtube.com' }, { t: 'ChatGPT', u: 'https://chat.openai.com' },
    { t: 'Jina', u: 'https://jina.ai' }
  ] },
  render(env) {
    const items = arr(env.cfg.items)
    return e('div', { className: 'ag-links' },
      items.map((it, i) => e('button', {
        key: i, className: 'ag-link', title: it.u,
        onClick: () => env.open(it.u)
      },
        e('img', { src: fav(it.u), alt: '', onError: (ev) => { ev.currentTarget.style.visibility = 'hidden' } }),
        e('span', null, it.t || hostOf(it.u))
      )),
      env.edit ? e('button', { className: 'ag-link', onClick: () => env.set({ items: items.concat({ t: 'New', u: 'https://' }) }) },
        e('span', { className: 'ag-fb' }, '+'), e('span', null, 'add')) : null)
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET embedded] =====
def({
  type: 'embedded', label: 'Embedded page', glyph: '🖥', w: 6, h: 6,
  hint: 'SandboxedFrame, только http(s). Сайты с X-Frame-Options пустые.',
  cfg: { url: 'https://hermes-agent.nousresearch.com/docs', title: 'Hermes docs' },
  render(env) {
    return e('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', gap: 6 } },
      env.edit ? e('input', {
        className: 'ag-in', value: env.cfg.url || '', spellCheck: false,
        onChange: (ev) => env.set({ url: ev.target.value })
      }) : null,
      e(SandboxedFrame, { src: env.cfg.url, title: env.cfg.title || 'embedded', className: 'ag-frame' }),
      e('div', { className: 'ag-row ag-tiny' }, hostOf(env.cfg.url || ''),
        e('button', { className: 'ag-btn', style: { marginLeft: 'auto' }, onClick: () => env.open(env.cfg.url) }, 'в браузере')))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET notes] =====
def({
  type: 'notes', label: 'Notes', glyph: '📝', w: 4, h: 4,
  cfg: { text: '' },
  render(env) {
    return e(Textarea, {
      className: 'ag-ta', style: { minHeight: '100%', flex: 1 },
      placeholder: 'Быстрая заметка…', value: env.cfg.text || '',
      onChange: (ev) => env.set({ text: ev.target.value })
    })
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET tasks] =====
def({
  type: 'tasks', label: 'Tasks', glyph: '✅', w: 4, h: 4,
  cfg: { items: [{ t: 'Разобраться с дашбордом', d: false }] },
  render(env) {
    const items = arr(env.cfg.items)
    const left = items.filter((i) => !i.d).length
    const [draft, setDraft] = useState('')
    const add = () => { if (!draft.trim()) return; env.set({ items: items.concat({ t: draft.trim(), d: false }) }); setDraft('') }
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
      e('div', { className: 'ag-row ag-tiny' }, left ? left + ' осталось' : 'всё сделано',
        e('span', { style: { marginLeft: 'auto' } }, items.length ? Math.round((items.length - left) / items.length * 100) + '%' : '—')),
      e('div', { className: 'ag-bar' }, e('i', { style: { width: (items.length ? (items.length - left) / items.length * 100 : 0) + '%' } })),
      e('ul', { className: 'ag-list' }, items.map((it, i) => e('li', { key: i, className: 'ag-li', 'data-done': !!it.d },
        e('input', { type: 'checkbox', checked: !!it.d, onChange: () => env.set({ items: items.map((x, j) => j === i ? { ...x, d: !x.d } : x) }) }),
        e('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, it.t),
        env.edit ? e('button', { className: 'ag-x', onClick: () => env.set({ items: items.filter((_, j) => j !== i) }) }, '×') : null))),
      e('input', { className: 'ag-in', placeholder: '+ задача и Enter', value: draft,
        onChange: (ev) => setDraft(ev.target.value), onKeyDown: (ev) => ev.key === 'Enter' && add() }))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET clock] =====
def({
  type: 'clock', label: 'Clock', glyph: '🕐', w: 3, h: 2,
  cfg: { h24: true, seconds: true, tz: '' },
  render(env) {
    const t = useValue($now)
    const d = new Date(t)
    const s = env.cfg.seconds ? ':' + pad(d.getSeconds()) : ''
    let txt = env.cfg.h24 ? pad(d.getHours()) + ':' + pad(d.getMinutes()) + s : ((d.getHours() % 12) || 12) + ':' + pad(d.getMinutes()) + s
    if (env.cfg.tz) {
      try { txt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: env.cfg.tz }).format(d) } catch {}
    }
    return e('div', { className: 'ag-row', style: { height: '100%', gap: 10 } },
      e('div', null, e('div', { className: 'ag-big ag-num' }, txt),
        e('div', { className: 'ag-tiny' }, d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))),
      env.edit ? e('div', { className: 'ag-mood', style: { flexDirection: 'column' } },
        e('button', { 'data-on': !!env.cfg.h24, onClick: () => env.set({ h24: !env.cfg.h24 }), title: '24 часа' }, '24'),
        e('button', { 'data-on': !!env.cfg.seconds, onClick: () => env.set({ seconds: !env.cfg.seconds }), title: 'секунды' }, 's')) : null)
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET worldtime] =====
def({
  type: 'worldtime', label: 'World time', glyph: '🌍', w: 3, h: 4,
  cfg: { zones: [
    { c: 'Москва', z: 'Europe/Moscow' }, { c: 'Бали', z: 'Asia/Makassar' },
    { c: 'НЙ', z: 'America/New_York' }, { c: 'Токио', z: 'Asia/Tokyo' }
  ] },
  render(env) {
    const t = useValue($now)
    const fmt = (z) => { try { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: z }).format(new Date(t)) } catch { return '—' } }
    const off = (z) => { try { const a = new Date(t).getTimezoneOffset(); const b = -((new Date(t).toLocaleString('en-US', { timeZone: z }))); return Math.round(((new Date(b) - new Date(a)) / 3600000)) } catch { return 0 } }
    return e('div', { className: 'ag-hrs' }, arr(env.cfg.zones).map((zn, i) => e('div', { key: i, className: 'ag-row' },
      e('span', { className: 'ag-dim' }, zn.c),
      e('span', { className: 'ag-num' }, fmt(zn.z), ' ', e('i', { className: 'ag-tiny' }, (off(zn.z) >= 0 ? '+' : '') + off(zn.z) + 'ч')))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET calendar] =====
def({
  type: 'calendar', label: 'Calendar', glyph: '📅', w: 4, h: 4,
  cfg: { offset: 0 },
  render(env) {
    const t = useValue($now)
    const today = new Date(t)
    const base = new Date(today.getFullYear(), today.getMonth() + (env.cfg.offset || 0), 1)
    const first = (base.getDay() + 6) % 7
    const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < first; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7) cells.push(null)
    return e('div', null,
      e('div', { className: 'ag-row', style: { margin: '2px 0 6px' } },
        e('button', { className: 'ag-btn', onClick: () => env.set({ offset: (env.cfg.offset || 0) - 1 }) }, '‹'),
        e('b', { style: { fontSize: 13 } }, base.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })),
        e('button', { className: 'ag-btn', onClick: () => env.set({ offset: (env.cfg.offset || 0) + 1 }) }, '›')),
      e('div', { className: 'ag-cal' },
        ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => e('b', { key: w }, w)),
        cells.map((d, i) => e('i', { key: i, 'data-today': d && env.cfg.offset === 0 && d === today.getDate() }, d || ''))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET weather] =====
def({
  type: 'weather', label: 'Weather', glyph: '☀', w: 3, h: 3,
  hint: 'Open-Meteo, без ключа',
  cfg: { city: 'Moscow', lat: 55.7558, lon: 37.6173 },
  render(env) {
    const st = useFetch(() => getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + env.cfg.lat +
      '&longitude=' + env.cfg.lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto'), [env.cfg.lat, env.cfg.lon], 600000)
    const code = (c) => c === 0 ? '☀' : c <= 2 ? '🌤' : c === 3 ? '☁' : c < 50 ? '🌦' : c < 70 ? '🌧' : c < 80 ? '⛈' : '❄'
    return e(Net, { st, hint: 'нужен доступ в интернет' }, (() => {
      const c = st.data && st.data.current || {}
      const d = (st.data && st.data.daily) || {}
      return e('div', null,
        e('div', { className: 'ag-w' }, e('span', null, code(c.weather_code)),
          e('span', { className: 'ag-deg ag-num' }, Math.round(c.temperature_2m) + '°'),
          e('span', { className: 'ag-tiny' }, 'ощущ. ' + Math.round(c.apparent_temperature) + '°', e('br'), 'ветер ' + Math.round(c.wind_speed_10m) + ' м/с')),
        e('div', { className: 'ag-row ag-tiny', style: { marginTop: 6 } },
          (d.time || []).map((day, i) => e('span', { key: i, className: 'ag-pill' },
            day.slice(8) + ' ' + Math.round(d.temperature_2m_max[i]) + '°/' + Math.round(d.temperature_2m_min[i]) + '°'))))
    })())
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET rss] =====
def({
  type: 'rss', label: 'RSS', glyph: '📰', w: 4, h: 5,
  hint: 'часть сайтов блокирует iframe и CORS',
  cfg: { urls: ['https://hnrss.org/frontpage', 'https://www.hsblombard?'], limit: 8 },
  render(env) {
    const st = useFetch(async () => {
      const one = env.cfg.urls && env.cfg.urls[0]
      if (!one) return []
      const xml = await getText(one)
      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      const nodes = [].slice.call(doc.querySelectorAll('item'))
      if (!nodes.length) {
        const alt = [].slice.call(doc.querySelectorAll('entry'))
        return alt.slice(0, env.cfg.limit || 8).map((n) => ({
          t: (n.querySelector('title') || {}).textContent || '',
          u: ((n.querySelector('link') || {}).href) || '',
          s: ((n.querySelector('published') || {}).textContent || '').slice(0, 10)
        }))
      }
      return nodes.slice(0, env.cfg.limit || 8).map((n) => ({
        t: (n.querySelector('title') || {}).textContent || '',
        u: (n.querySelector('link') || {}).textContent || '',
        s: ((n.querySelector('pubDate') || {}).textContent || '').slice(5, 16)
      }))
    }, [env.cfg.urls && env.cfg.urls.join('|')], 300000)
    return e(Net, { st, hint: 'CORS у фидов' }, e('ul', { className: 'ag-list' }, arr(st.data).map((it, i) =>
      e('li', { key: i, className: 'ag-li', style: { cursor: 'pointer' }, onClick: () => env.open(it.u) },
        e('span', { style: { minWidth: 0 } }, it.t, e('span', { className: 'ag-tiny' }, ' · ' + it.s))))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET pomodoro] =====
def({
  type: 'pomodoro', label: 'Pomodoro', glyph: '🍅', w: 3, h: 3,
  cfg: { work: 25, rest: 5, left: 25 * 60, run: false, mode: 'work', done: 0 },
  render(env) {
    const t = useValue($now)
    const endRef = useRef(t)
    useEffect(() => { if (env.cfg.run) endRef.current = t + (env.cfg.left || 0) * 1000 }, [env.cfg.run])
    const left = env.cfg.run ? Math.max(0, Math.round((endRef.current - t) / 1000)) : (env.cfg.left || 0)
    const total = (env.cfg.mode === 'rest' ? env.cfg.rest : env.cfg.work) * 60
    const tick = () => {
      if (!env.cfg.run) return
      if (left <= 0) {
        const next = env.cfg.mode === 'work' ? 'rest' : 'work'
        env.set({ mode: next, run: false, left: (next === 'rest' ? env.cfg.rest : env.cfg.work) * 60, done: (env.cfg.done || 0) + (env.cfg.mode === 'work' ? 1 : 0) })
        host.notify({ kind: 'info', message: next === 'rest' ? 'Pomodoro: перерыв' : 'Pomodoro: работа' })
      } else env.set({ left: left - 1 })
    }
    useEffect(() => { const i = setInterval(tick, 1000); return () => clearInterval(i) }, [left])
    return e('div', { className: 'ag-row', style: { height: '100%', gap: 8 } },
      e('div', null, e('div', { className: 'ag-big ag-num' }, pad(Math.floor(left / 60)) + ':' + pad(left % 60)),
        e('div', { className: 'ag-tiny' }, env.cfg.mode === 'work' ? 'работа' : 'перерыв', ' · готово ' + (env.cfg.done || 0))),
      e('div', { className: 'ag-bar', style: { width: '100%' } }, e('i', { style: { width: (100 - left / (total || 1) * 100) + '%' } })),
      e('div', { className: 'ag-chips' },
        e('button', { className: 'ag-btn', 'data-on': !!env.cfg.run, onClick: () => env.set({ run: !env.cfg.run }) }, env.cfg.run ? 'пауза' : 'старт'),
        e('button', { className: 'ag-btn', onClick: () => env.set({ run: false, left: (env.cfg.mode === 'rest' ? env.cfg.rest : env.cfg.work) * 60 }) }, 'сброс'),
        env.edit ? e('button', { className: 'ag-btn', onClick: () => env.set({ work: (env.cfg.work || 25) + 5 }) }, '+5м') : null))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET countdown] =====
def({
  type: 'countdown', label: 'Countdown', glyph: '⏳', w: 3, h: 2,
  cfg: { label: 'До выходных', date: (function () { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay() + 7) % 7 || 7); return ymd(d) })() },
  render(env) {
    const t = useValue($now)
    const target = new Date((env.cfg.date || '') + 'T09:00:00').getTime()
    const ms = (target || t) - t
    const days = Math.floor(ms / 86400000), hrs = Math.floor(ms % 86400000 / 3600000)
    return e('div', null,
      e('div', { className: 'ag-big ag-num' }, ms > 0 ? days + 'д ' + hrs + 'ч' : 'сейчас'),
      e('div', { className: 'ag-tiny' }, env.cfg.label),
      env.edit ? e('input', { className: 'ag-in', type: 'date', value: env.cfg.date, onChange: (ev) => env.set({ date: ev.target.value }) }) : null)
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET dayprogress] =====
def({
  type: 'dayprogress', label: 'Day', glyph: '🌗', w: 3, h: 2,
  cfg: { workFrom: 9, workTo: 19 },
  render(env) {
    const t = useValue($now)
    const d = new Date(t)
    const mins = d.getHours() * 60 + d.getMinutes()
    const p = Math.round(mins / 1440 * 100)
    const from = (env.cfg.workFrom || 9) * 60, to = (env.cfg.workTo || 19) * 60
    const wp = clamp(Math.round((mins - from) / (to - from) * 100), 0, 100)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center', height: '100%' } },
      e('div', { className: 'ag-row' }, e('b', { className: 'ag-num' }, p + '%'), e('span', { className: 'ag-tiny' }, 'сутки'),
        e('span', { className: 'ag-tiny', style: { marginLeft: 'auto' } }, 'рабочий день ' + wp + '%')),
      e('div', { className: 'ag-bar' }, e('i', { style: { width: p + '%' } })),
      e('div', { className: 'ag-bar' }, e('i', { style: { width: wp + '%', opacity: .6 } })))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET yearprogress] =====
def({
  type: 'yearprogress', label: 'Year', glyph: '📈', w: 4, h: 3,
  cfg: { year: new Date().getFullYear() },
  render(env) {
    const t = useValue($now)
    const y = env.cfg.year || new Date(t).getFullYear()
    const a = new Date(y, 0, 1).getTime(), b = new Date(y + 1, 0, 1).getTime()
    const p = clamp((t - a) / (b - a) * 100, 0, 100)
    const blocks = 24
    const on = Math.round(p / 100 * blocks)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', height: '100%' } },
      e('div', { className: 'ag-row' }, e('b', { className: 'ag-num' }, p.toFixed(1) + '%'), e('span', { className: 'ag-tiny' }, y + ' год прошёл')),
      e('div', { className: 'ag-mono', style: { letterSpacing: 2 } }, '█'.repeat(on) + '░'.repeat(blocks - on)),
      e('div', { className: 'ag-tiny' }, 'осталось ' + Math.ceil((b - t) / 86400000) + ' дней'))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET lifeprogress] =====
def({
  type: 'lifeprogress', label: 'Life', glyph: '⏱', w: 4, h: 4,
  cfg: { born: '1990-01-01', span: 90 },
  render(env) {
    const t = useValue($now)
    const b = new Date((env.cfg.born || '1990-01-01') + 'T00:00:00').getTime()
    const span = env.cfg.span || 90
    const years = (t - b) / 31557600000
    const p = clamp(years / span * 100, 0, 100)
    const cells = 360
    const on = Math.round(years / span * cells)
    const rows = []
    for (let i = 0; i < cells; i += 20) rows.push('▓'.repeat(clamp(on - i, 0, 20)).padEnd(20, '·'))
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, height: '100%' } },
      e('div', { className: 'ag-row' }, e('b', { className: 'ag-num' }, years.toFixed(1) + ' лет'),
        e('span', { className: 'ag-tiny', style: { marginLeft: 'auto' } }, p.toFixed(1) + '% из ' + span)),
      e('div', { className: 'ag-mono', style: { fontSize: 11, lineHeight: '12px', color: 'var(--ag-accent)' } }, rows.join('\n')))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET habit] =====
def({
  type: 'habit', label: 'Habits', glyph: '🔥', w: 5, h: 3,
  cfg: { items: [{ t: 'Спорт', log: {} }, { t: 'Чтение', log: {} }] },
  render(env) {
    const t = useValue($now)
    const items = arr(env.cfg.items)
    const streak = (log) => { let n = 0; for (let i = 0; i < 60; i++) { const d = new Date(t - i * 86400000); if (log[ymd(d)]) n++; else if (i) break; else continue }; return n }
    return e('div', { className: 'ag-list' }, items.map((it, i) => {
      const log = obj(it.log, {})
      const week = []
      for (let k = 6; k >= 0; k--) week.push(log[ymd(new Date(t - k * 86400000))])
      return e('div', { key: i, className: 'ag-row', style: { gap: 8 } },
        e('span', { className: 'ag-dim', style: { flex: '1 1 auto', minWidth: 0 } }, it.t),
        e('div', { className: 'ag-mood' }, week.map((on, j) => e('button', {
          key: j, 'data-on': !!on, title: ymd(new Date(t - (6 - j) * 86400000)),
          onClick: () => { const key = ymd(new Date(t - (6 - j) * 86400000)); const nx = { ...log }; if (nx[key]) delete nx[key]; else nx[key] = 1; env.set({ items: items.map((x, m) => m === i ? { ...x, log: nx } : x) }) }
        }, '·'))),
        e('span', { className: 'ag-num ag-tiny' }, streak(log) + '🔥'))
    }))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET flashcards] =====
def({
  type: 'flashcards', label: 'Flashcards', glyph: '🃏', w: 4, h: 4,
  cfg: { deck: [{ q: 'Port в гексагональной архитектуре', a: 'интерфейс, который реализует адаптер' }, { q: 'SOLID: D', a: 'inversion of dependencies' }], i: 0, flip: false },
  render(env) {
    const deck = arr(env.cfg.deck)
    const i = clamp(env.cfg.i || 0, 0, Math.max(0, deck.length - 1))
    const card = deck[i] || { q: 'пусто', a: 'добавь карточки в конфиге' }
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
      e('div', { className: 'ag-mid', style: { cursor: 'pointer' }, onClick: () => env.set({ flip: !env.cfg.flip }) }, env.cfg.flip ? card.a : card.q),
      e('div', { className: 'ag-tiny' }, env.cfg.flip ? 'ответ' : 'вопрос · клик = перевернуть', ' · ' + (i + 1) + '/' + deck.length),
      e('div', { className: 'ag-chips', style: { marginTop: 'auto' } },
        e('button', { className: 'ag-btn', onClick: () => env.set({ i: (i - 1 + deck.length) % deck.length, flip: false }) }, '‹'),
        e('button', { className: 'ag-btn', onClick: () => env.set({ i: (i + 1) % deck.length, flip: false }) }, '›'),
        env.edit ? e('button', { className: 'ag-btn', onClick: () => env.set({ deck: deck.concat({ q: 'вопрос', a: 'ответ' }) }) }, '+card') : null))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET quote] =====
def({
  type: 'quote', label: 'Motivation', glyph: '✨', w: 4, h: 3,
  cfg: { list: [
    'Сделано лучше, чем идеально.',
    'Лучший способ предсказать будущее — изобрести его.',
    'Не откладывай на завтра то, что можно удалить навсегда.',
    'Простота — высшая форма совершенства.',
    'Дисциплина — это выбор между тем, что хочешь сейчас, и тем, что хочешь больше всего.'
  ], i: 0 },
  render(env) {
    const list = arr(env.cfg.list)
    const day = Math.floor(Date.now() / 86400000)
    const i = env.cfg.i == null ? day % (list.length || 1) : clamp(env.cfg.i, 0, list.length - 1)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%', justifyContent: 'center' } },
      e('div', { className: 'ag-quote' }, '“' + (list[i] || '—') + '”'),
      e('div', { className: 'ag-chips' },
        e('button', { className: 'ag-btn', onClick: () => env.set({ i: (i + 1) % (list.length || 1) }) }, 'другая'),
        e('button', { className: 'ag-btn', onClick: () => env.set({ list: list.concat('новая мысль') }) }, '+мысль')))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET sticky] =====
def({
  type: 'sticky', label: 'Sticky notes', glyph: '🟨', w: 4, h: 4,
  cfg: { notes: [{ t: 'Позвонить в банк', c: 0 }, { t: 'git push', c: 2 }] },
  render(env) {
    const notes = arr(env.cfg.notes)
    const hues = ['color-mix(in srgb,var(--ag-accent) 26%,transparent)', '#f2c14e33', '#7ad0ff33', '#ff9d9d33', '#b6ff9d33']
    return e('div', { className: 'ag-strip' }, notes.map((n, i) => e('div', { key: i, className: 'ag-card', style: { width: 116 } },
      e('div', { className: 'ag-cardh', style: { background: hues[(n.c || 0) % hues.length] } }),
      e('p', { style: { whiteSpace: 'pre-wrap' }, contentEditable: true, suppressContentEditableWarning: true,
        onBlur: (ev) => env.set({ notes: notes.map((x, j) => j === i ? { ...x, t: ev.currentTarget.textContent } : x) }) }, n.t),
      env.edit ? e('button', { className: 'ag-btn', style: { margin: '0 6px 6px' }, onClick: () => env.set({ notes: notes.filter((_, j) => j !== i) }) }, 'удалить') : null)),
      env.edit ? e('div', { className: 'ag-card', style: { width: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        onClick: () => env.set({ notes: notes.concat({ t: 'заметка', c: notes.length % 5 }) }) }, '+') : null)
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET routine] =====
def({
  type: 'routine', label: 'Routine', glyph: '🔁', w: 4, h: 4,
  cfg: { day: '', items: ['вода', 'разбор почты', 'прогулка 30 мин', 'план на завтра'] },
  render(env) {
    const t = useValue($now)
    const today = ymd(new Date(t))
    if (env.cfg.day !== today) setTimeout(() => env.set({ day: today, done: {} }), 0)
    const done = obj(env.cfg.day === today ? env.cfg.done : {}, {})
    const items = arr(env.cfg.items)
    return e('div', { className: 'ag-list' }, items.map((it, i) => e('li', { key: i, className: 'ag-li', 'data-done': !!done[i] },
      e('input', { type: 'checkbox', checked: !!done[i], onChange: () => env.set({ day: today, done: { ...done, [i]: !done[i] } }) }),
      e('span', null, it),
      env.edit ? e('button', { className: 'ag-x', onClick: () => env.set({ items: items.filter((_, j) => j !== i) }) }, '×') : null)),
      env.edit ? e('button', { className: 'ag-btn', onClick: () => env.set({ items: items.concat('новый пункт') }) }, '+ пункт') : null)
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET journal] =====
def({
  type: 'journal', label: 'Daily journal', glyph: '📓', w: 5, h: 5,
  cfg: { pages: {} },
  render(env) {
    const t = useValue($now)
    const today = ymd(new Date(t))
    const pages = obj(env.cfg.pages, {})
    const keys = Object.keys(pages).sort().reverse().slice(0, 14)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
      e('div', { className: 'ag-tiny' }, 'записи: ' + keys.length + ' · сегодня ' + today),
      e(Textarea, { className: 'ag-ta', placeholder: 'одна строка о дне…', value: pages[today] || '',
        onChange: (ev) => env.set({ pages: { ...pages, [today]: ev.target.value } }) }),
      e('div', { className: 'ag-chips' }, keys.slice(0, 6).map((k) => e('button', { key: k, className: 'ag-btn',
        'data-on': pages[k] === pages[today] && !!pages[k], title: (pages[k] || '').slice(0, 60),
        onClick: () => env.set({ pages: { ...pages, [today]: pages[k] } }) }, k.slice(5)))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET search] =====
def({
  type: 'search', label: 'Search', glyph: '🔎', w: 5, h: 2,
  cfg: { engine: 'https://google.com/search?q=', eng: 'Google', alt: ['https://duckduckgo.com/?q=', 'https://github.com/search?q='] },
  render(env) {
    const [q, setQ] = useState('')
    const go = () => { if (q.trim()) env.open(env.cfg.engine + encodeURIComponent(q.trim())) }
    return e('div', { className: 'ag-row' },
      e('input', { className: 'ag-in', placeholder: 'искать в ' + (env.cfg.eng || 'вебе') + '…', value: q,
        onChange: (ev) => setQ(ev.target.value), onKeyDown: (ev) => ev.key === 'Enter' && go() }),
      e('button', { className: 'ag-btn', onClick: go }, '→'))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET calc] =====
def({
  type: 'calc', label: 'Calculator', glyph: '🧮', w: 3, h: 5,
  cfg: { v: '0', acc: null, op: null, fresh: true },
  render(env) {
    const c = env.cfg
    const set = (patch) => env.set(patch)
    const num = (d) => {
      const v = c.fresh || c.v === '0' ? d : c.v + d
      set({ v, fresh: false })
    }
    const apply = () => {
      const a = Number(c.acc || 0), b = Number(c.v || 0)
      const r = c.op === '+' ? a + b : c.op === '-' ? a - b : c.op === '×' ? a * b : b === 0 ? NaN : a / b
      set({ v: String(Math.round(r * 1e8) / 1e8), acc: null, op: null, fresh: true })
    }
    const op = (o) => set({ acc: c.v, op: o, fresh: true })
    const key = (k, extra) => e('button', { className: 'ag-key', onClick: () => extra(), ...{ 'data-acc': !!extra } }, k)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
      e('div', { className: 'ag-mid ag-num', style: { textAlign: 'right', wordBreak: 'break-all' } }, c.v),
      e('div', { className: 'ag-pad' },
        key('C', () => set({ v: '0', acc: null, op: null, fresh: true })), key('±', () => set({ v: String(-Number(c.v || 0)) })),
        key('%', () => set({ v: String(Number(c.v || 0) / 100) })), key('÷', () => op('÷')),
        ['7', '8', '9'].map((d) => key(d, () => num(d))), key('×', () => op('×')),
        ['4', '5', '6'].map((d) => key(d, () => num(d))), key('-', () => op('-')),
        ['1', '2', '3'].map((d) => key(d, () => num(d))), key('+', () => op('+')),
        key('0', () => num('0')), key('.', () => num(c.v.includes('.') ? '' : '.')), key('=', apply)))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET snippet] =====
def({
  type: 'snippet', label: 'Snippet', glyph: '🧩', w: 5, h: 5,
  cfg: { name: 'curl api', code: "curl -s http://localhost:9119/api/status | jq ." },
  render(env) {
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
      e('div', { className: 'ag-row' },
        e(Input, { className: 'ag-in', style: { flex: 1 }, value: env.cfg.name || '', onChange: (ev) => env.set({ name: ev.target.value }) }),
        e('button', { className: 'ag-btn', onClick: () => host.notify({ kind: 'info', message: 'скопировано' }),
          onMouseDown: async () => { try { await navigator.clipboard.writeText(env.cfg.code || '') } catch { } } }, 'копировать')),
      e(Textarea, { className: 'ag-ta', style: { flex: 1, minHeight: 90 }, value: env.cfg.code || '', spellCheck: false,
        onChange: (ev) => env.set({ code: ev.target.value }) }))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET status] =====
def({
  type: 'status', label: 'App status', glyph: '🛰', w: 4, h: 2,
  cfg: {},
  render(env) {
    const str = (v) => v == null ? '—' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : (v.id || v.name || v.label || v.model || v.state || v.status || JSON.stringify(v).slice(0, 40))
    const model = useValue(host.state.model)
    const profile = useValue(host.state.profile)
    const busy = useValue(host.state.busy)
    const gw = useValue(host.state.gateway)
    const cwd = useValue(host.state.cwd)
    const rows = [['model', str(model)], ['profile', str(profile)], ['gateway', str(gw)], ['cwd', cwd ? String(cwd).split(/[\\/]/).pop() : '—']]
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', height: '100%' } },
      e('div', { className: 'ag-row' },
        e('span', { className: 'ag-pill' }, busy ? e('b', null, 'работает') : 'ожидание'),
        e('span', { className: 'ag-tiny', style: { marginLeft: 'auto' } }, new Date(useValue($now)).toLocaleTimeString('ru-RU'))),
      rows.map((r) => e('div', { key: r[0], className: 'ag-row ag-tiny' },
        e('span', { className: 'ag-dim', style: { width: 62, flex: '0 0 auto' } }, r[0]),
        e('span', { className: 'ag-mono', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r[1]))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET usage] =====
def({
  type: 'usage', label: 'Tokens', glyph: '📊', w: 4, h: 3,
  cfg: {},
  render(env) {
    const u = useValue(host.state.focusedUsage)
    const nums = []
    try { for (const k of Object.keys(u || {})) { const v = u[k]; if (typeof v === 'number' && isFinite(v) && v > 0) nums.push([k, v]) } } catch {}
    nums.sort((a, b) => b[1] - a[1])
    const top = nums.slice(0, 5)
    const max = top.length ? top[0][1] : 1
    const kfmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n))
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', height: '100%' } },
      top.length ? top.map((r) => e('div', { key: r[0] },
        e('div', { className: 'ag-row ag-tiny' }, e('span', { className: 'ag-dim' }, r[0]), e('span', { className: 'ag-num' }, kfmt(r[1]))),
        e('div', { className: 'ag-bar' }, e('i', { style: { width: (r[1] / max * 100) + '%' } }))) )
        : e('div', { className: 'ag-tiny' }, 'нет данных: открой чат, где агент уже отвечал'))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET converter] =====
def({
  type: 'converter', label: 'Converter', glyph: '🔁', w: 4, h: 3,
  cfg: { kind: 'len', v: 1 },
  render(env) {
    const KINDS = {
      len: { u: ['м', 'км', 'миля', 'фут'], f: [1, 1000, 1609.34, 0.3048] },
      mass: { u: ['г', 'кг', 'фунт', 'унция'], f: [1, 1000, 453.592, 28.3495] },
      data: { u: ['Б', 'КБ', 'МБ', 'ГБ'], f: [1, 1024, 1048576, 1073741824] },
      time: { u: ['сек', 'мин', 'час', 'сутки'], f: [1, 60, 3600, 86400] },
      temp: { u: ['°C', '°F', 'K'], f: null }
    }
    const k = KINDS[env.cfg.kind] || KINDS.len
    const v = Number(env.cfg.v || 0)
    const conv = (i) => k.f ? v * k.f[0] / k.f[i]
      : i === 0 ? v : i === 1 ? v * 9 / 5 + 32 : v + 273.15
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, height: '100%', justifyContent: 'center' } },
      e('div', { className: 'ag-chips' }, Object.keys(KINDS).map((key) => e('button', { key, className: 'ag-btn',
        'data-on': env.cfg.kind === key, onClick: () => env.set({ kind: key }) }, KINDS[key].u[0] + '→'))),
      e('input', { className: 'ag-in', type: 'number', value: env.cfg.v, onChange: (ev) => env.set({ v: ev.target.value }) }),
      e('div', { className: 'ag-list' }, k.u.map((u, i) => e('div', { key: u, className: 'ag-row ag-tiny' },
        e('span', { className: 'ag-dim', style: { width: 52 } }, u),
        e('span', { className: 'ag-num' }, (conv(i) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 }))))) )
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET wordcount] =====
def({
  type: 'wordcount', label: 'Text stats', glyph: '🔤', w: 4, h: 4,
  cfg: { text: '' },
  render(env) {
    const t = env.cfg.text || ''
    const words = t.trim() ? t.trim().split(/\s+/).length : 0
    const lines = t ? t.split('\n').length : 0
    const sent = (t.match(/[.!?]+/g) || []).length
    const stats = [['слов', words], ['знаков', t.length], ['без пробелов', t.replace(/\s/g, '').length], ['строк', lines], ['предложений', sent], ['чтение, мин', (words / 200).toFixed(1)]]
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, height: '100%' } },
      e(Textarea, { className: 'ag-ta', style: { minHeight: 54 }, placeholder: 'вставь текст…', value: t, onChange: (ev) => env.set({ text: ev.target.value }) }),
      e('div', { className: 'ag-cal', style: { gridTemplateColumns: 'repeat(3,1fr)' } }, stats.map((s) => e('div', { key: s[0] },
        e('div', { className: 'ag-num', style: { color: 'var(--ag-accent)' } }, String(s[1])), e('div', { className: 'ag-tiny' }, s[0])))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET dice] =====
def({
  type: 'dice', label: 'Dice', glyph: '🎲', w: 3, h: 3,
  cfg: { sides: 6, count: 2, hist: [] },
  render(env) {
    const roll = () => {
      const n = clamp(env.cfg.count || 1, 1, 12), s = clamp(env.cfg.sides || 6, 2, 1000)
      const d = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * s))
      env.set({ hist: [d.join('+') + ' = ' + d.reduce((a, b) => a + b, 0)].concat(arr(env.cfg.hist)).slice(0, 8) })
    }
    const last = (env.cfg.hist && env.cfg.hist[0] || '').split('=')[1]
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, height: '100%', justifyContent: 'center' } },
      e('div', { className: 'ag-row' }, e('b', { className: 'ag-num', style: { fontSize: 26, color: 'var(--ag-accent)' } }, last || '—'),
        e('span', { className: 'ag-tiny' }, (env.cfg.count || 2) + 'd' + (env.cfg.sides || 6))),
      e('div', { className: 'ag-chips' },
        e('button', { className: 'ag-btn', onClick: roll }, 'бросить'),
        [4, 6, 20].map((s) => e('button', { key: s, className: 'ag-btn', 'data-on': env.cfg.sides === s, onClick: () => env.set({ sides: s }) }, 'd' + s))),
      e('div', { className: 'ag-tiny', style: { whiteSpace: 'pre-line' } }, arr(env.cfg.hist).slice(1, 4).join('\n')))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET roulette] =====
def({
  type: 'roulette', label: 'Roulette', glyph: '🎯', w: 4, h: 3,
  cfg: { opts: ['обед: суп', 'обед: паста', 'обед: салат', 'кофе', 'прогулка'], pick: '' },
  render(env) {
    const opts = arr(env.cfg.opts)
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, height: '100%', justifyContent: 'center' } },
      e('div', { className: 'ag-mid', style: { color: 'var(--ag-accent)' } }, env.cfg.pick || '—'),
      e('div', { className: 'ag-chips' },
        e('button', { className: 'ag-btn', onClick: () => env.set({ pick: opts.length ? opts[Math.floor(Math.random() * opts.length)] : 'пусто' }) }, 'выбрать'),
        e('button', { className: 'ag-btn', onClick: () => { const c = opts.slice().sort(() => Math.random() - .5); env.set({ opts: c, pick: c[0] || '' }) } }, 'перемешать')),
      env.edit ? e('input', { className: 'ag-in', value: opts.join(', '), onChange: (ev) => env.set({ opts: ev.target.value.split(',').map((s) => s.trim()).filter(Boolean) }) })
        : e('div', { className: 'ag-tiny' }, opts.length + ' вариантов'))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET palette] =====
def({
  type: 'palette', label: 'Colors', glyph: '🎨', w: 4, h: 3,
  cfg: { base: '' },
  render(env) {
    const st = useFetch(async () => {
      const d = await getJSON('https://www.thecolorapi.com/scheme?hex=' + (env.cfg.base || '6fbf9a') + '&format=json&mode=triad&count=5')
      return (d.colors || []).map((c) => c.hex.value)
    }, [env.cfg.base], 0)
    return e(Net, { st, hint: 'thecolorapi.com' }, e('div', { className: 'ag-chips' },
      arr(st.data).map((h) => e('button', { key: h, className: 'ag-pill', title: 'копировать ' + h,
        onClick: async () => { try { await navigator.clipboard.writeText(h); host.notify({ kind: 'info', message: h }) } catch { } } },
        e('span', { style: { width: 12, height: 12, borderRadius: 3, background: h, display: 'inline-block' } }), h))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET mood] =====
def({
  type: 'mood', label: 'Mood log', glyph: '🙂', w: 4, h: 3,
  cfg: { log: {} },
  render(env) {
    const t = useValue($now)
    const log = obj(env.cfg.log, {})
    const today = ymd(new Date(t))
    const keys = Object.keys(log).sort().slice(-14)
    const faces = ['😞', '😐', '🙂', '😄', '🔥']
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%', justifyContent: 'center' } },
      e('div', { className: 'ag-mood' }, faces.map((f, i) => e('button', { key: f, 'data-on': log[today] === i,
        onClick: () => env.set({ log: { ...log, [today]: i } }) }, f))),
      e('div', { className: 'ag-row', style: { gap: 2 } }, keys.map((k) => e('span', { key: k, title: k,
        style: { width: 12, height: 12, borderRadius: 3, background: 'color-mix(in srgb,var(--ag-accent) ' + (15 + (log[k] || 0) * 20) + '%,transparent)' } }))))
  }
})
// ===== [/WIDGET] =====

// ===== [WIDGET goals] =====
def({
  type: 'goals', label: 'Goals', glyph: '🏁', w: 4, h: 4,
  cfg: { items: [{ t: 'Демо-дашборд в Hermes', now: 60, to: 100 }, { t: '30 виджетов', now: 32, to: 30 }] },
  render(env) {
    const items = arr(env.cfg.items)
    return e('div', { className: 'ag-list' }, items.map((g, i) => {
      const p = clamp((g.now || 0) / (g.to || 1) * 100, 0, 100)
      return e('div', { key: i, style: { display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' } },
        e('div', { className: 'ag-row ag-tiny' }, e('span', { className: 'ag-dim' }, g.t),
          e('span', { className: 'ag-num', style: { marginLeft: 'auto' } }, Math.round(p) + '%'),
          env.edit ? e('button', { className: 'ag-x', onClick: () => env.set({ items: items.filter((_, j) => j !== i) }) }, '×') : null),
        e('div', { className: 'ag-bar' }, e('i', { style: { width: p + '%' } })),
        e('div', { className: 'ag-chips' },
          e('button', { className: 'ag-btn', onClick: () => env.set({ items: items.map((x, j) => j === i ? { ...x, now: (x.now || 0) + 1 } : x) }) }, '+1'),
          e('button', { className: 'ag-btn', onClick: () => env.set({ items: items.map((x, j) => j === i ? { ...x, now: (x.now || 0) - 1 } : x) }) }, '−1')))
    }))
  }
})
// ===== [/WIDGET] =====

// ---------------------------------------------------------------- engine
const TileBody = ({ d, env }) => d.render(env)

const defaultDoc = () => ({
  v: 1, active: 0,
  folders: [{
    id: uid(), name: 'День', theme: 'moss', wall: 'none', compact: false,
    tiles: [
      { id: uid(), type: 'clock', w: 3, h: 2, cfg: null },
      { id: uid(), type: 'dayprogress', w: 3, h: 2, cfg: null },
      { id: uid(), type: 'weather', w: 3, h: 3, cfg: null },
      { id: uid(), type: 'countdown', w: 3, h: 2, cfg: null },
      { id: uid(), type: 'links', w: 6, h: 3, cfg: null },
      { id: uid(), type: 'tasks', w: 3, h: 4, cfg: null },
      { id: uid(), type: 'notes', w: 3, h: 4, cfg: null },
      { id: uid(), type: 'rss', w: 6, h: 4, cfg: null },
      { id: uid(), type: 'calendar', w: 3, h: 4, cfg: null },
      { id: uid(), type: 'status', w: 3, h: 2, cfg: null }
    ]
  }]
})

const cfgOf = (tile) => { const d = WIDGETS[tile.type]; return Object.assign({}, d ? d.cfg : {}, obj(tile.cfg, {})) }

function App({ ctx }) {
  const [doc, setDoc] = useState(() => {
    const s = obj(ctx.storage.get(STORE, null), null)
    return s && arr(s.folders).length ? s : defaultDoc()
  })
  const [edit, setEdit] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [cfgDraft, setCfgDraft] = useState(null)
  const openSheet = (id) => { setCfgDraft(JSON.stringify(cfgOf(tiles.find((t) => t.id === id) || { cfg: {} }), null, 1)); setSheet(id) }
  const docRef = useRef(doc)
  const gridRef = useRef(null)
  const drag = useRef(-1)

  useEffect(() => { docRef.current = doc }, [doc])
  const save = (next) => { docRef.current = next; setDoc(next); try { ctx.storage.set(STORE, next) } catch (err) { host.notify({ kind: 'error', message: 'Anori: не удалось сохранить layout' }) } }
  const mutate = (fn) => save(fn(docRef.current))
  const touch = (fn) => mutate((d) => ({ ...d, folders: d.folders.map((f, i) => i === d.active ? fn(f) : f) }))

  const folder = (doc.folders || [])[clamp(doc.active, 0, doc.folders.length - 1)] || doc.folders[0]
  const tiles = arr(folder.tiles) // eslint-disable-line
  const th = THEMES[folder.theme] || THEMES.moss
  const photo = folder.photo ? 'url("' + String(folder.photo).replace(/"/g, '') + '") center/cover no-repeat' : ''
  const wall = photo || (WALLS[folder.wall] ? WALLS[folder.wall].url : '')
  const hour = new Date().getHours()
  const hello = hour < 5 ? 'ночь на дворе' : hour < 12 ? 'доброе утро' : hour < 18 ? 'добрый день' : 'добрий вечер'

  const openUrl = (url) => {
    if (!url) return
    const u = String(url).trim()
    if (!/^https?:\/\//i.test(u)) { host.notify({ kind: 'error', message: 'Anori: ссылка должна быть http(s)' }); return }
    const back = (how) => { try { window.open(u, '_blank', 'noopener,noreferrer') } catch { host.notify({ kind: 'error', message: 'Anori: браузер не открылся (' + how + ')' }) } }
    if (ctx.os && ctx.os.openExternal) ctx.os.openExternal(u).then((ok) => { if (!ok) back('fallback') }, () => back('fallback'))
    else back('no os door')
  }

  const addTile = (type) => {
    const d = WIDGETS[type]
    touch((f) => ({ ...f, tiles: arr(f.tiles).concat({ id: uid(), type, w: d.w, h: d.h, cfg: null }) }))
    setSheet(null)
  }
  const delTile = (id) => touch((f) => ({ ...f, tiles: arr(f.tiles).filter((t) => t.id !== id) }))
  const setTile = (id, patch) => touch((f) => ({ ...f, tiles: arr(f.tiles).map((t) => t.id === id ? { ...t, ...patch } : t) }))
  const setCfg = (id, patch) => touch((f) => ({ ...f, tiles: arr(f.tiles).map((t) => {
    if (t.id !== id) return t
    const base = obj(t.cfg, cfgOf(t))
    const add = typeof patch === 'function' ? patch(base) : patch
    return { ...t, cfg: Object.assign({}, base, add) }
  }) }))

  const resize = (ev, tile) => {
    ev.preventDefault(); ev.stopPropagation()
    const rect = gridRef.current ? gridRef.current.getBoundingClientRect() : { width: COLS * 90 }
    const cw = (rect.width + 12) / COLS, ch = ROW + 12
    const x0 = ev.clientX, y0 = ev.clientY, w0 = tile.w, h0 = tile.h
    const move = (e2) => setTile(tile.id, {
      w: clamp(Math.round(w0 + (e2.clientX - x0) / cw), 2, COLS),
      h: clamp(Math.round(h0 + (e2.clientY - y0) / ch), 1, 16)
    })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const dropOn = (j) => {
    const from = drag.current
    if (from < 0 || from === j) return
    touch((f) => { const list = arr(f.tiles).slice(); const [m] = list.splice(from, 1); list.splice(j, 0, m); return { ...f, tiles: list } })
    drag.current = j
  }

  const rootStyle = {
    '--ag-accent': th.accent, '--ag-on': th.on, '--ag-veil': 'linear-gradient(180deg,#00000000,#00000000)',
    '--ag-card': 'color-mix(in srgb,#000000 22%,transparent)',
    '--ag-card-solid': 'color-mix(in srgb,#000000 60%,transparent)',
    '--ag-wall': wall || th.wall
  }

  return e('div', { className: cn('ag'), style: rootStyle, 'data-edit': edit }, e('div', { className: 'ag-inner' },
    e('div', { className: 'ag-top' },
      e('span', { className: 'ag-title' }, 'Anori'),
      e('span', { className: 'ag-hello' }, hello + ' · ' + tiles.length + ' виджетов'),
      e('div', { className: 'ag-tabs' }, arr(doc.folders).map((f, i) => edit
        ? e('span', { key: f.id, className: 'ag-tab ag-tab-edit', 'data-on': i === doc.active },
            e('input', { className: 'ag-tabname', value: f.name, spellCheck: false,
              onFocus: () => mutate((d) => ({ ...d, active: i })),
              onChange: (ev) => mutate((d) => ({ ...d, folders: d.folders.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) })) }),
            e('button', {
              className: 'ag-tabx', disabled: arr(doc.folders).length <= 1,
              title: arr(doc.folders).length <= 1 ? 'нужна хотя бы одна папка' : 'удалить папку',
              onClick: () => mutate((d) => {
                const fs = d.folders.filter((_, j) => j !== i)
                return { ...d, folders: fs, active: clamp(d.active > i ? d.active - 1 : d.active, 0, fs.length - 1) }
              })
            }, '×'))
        : e('button', { key: f.id, className: 'ag-tab', 'data-on': i === doc.active,
          onClick: () => mutate((d) => ({ ...d, active: i })) }, f.name))),
      e('button', { className: 'ag-btn', onClick: () => mutate((d) => ({ ...d, folders: d.folders.concat({ id: uid(), name: 'Папка ' + (d.folders.length + 1), theme: 'ice', wall: 'none', tiles: [] }), active: doc.folders.length })) }, '+ папка'),
      e('button', { className: 'ag-btn', 'data-on': edit, onClick: () => setEdit(!edit) }, edit ? 'готово' : 'правка'),
      e('button', { className: 'ag-btn', onClick: () => setSheet('style') }, 'стиль')),

    e('div', { ref: gridRef, className: 'ag-grid', style: { gridAutoFlow: 'row dense' } },
      tiles.map((tile, i) => {
        const d = WIDGETS[tile.type]
        if (!d) return null
        const env = { ctx, cfg: cfgOf(tile), set: (p) => setCfg(tile.id, p), edit, open: openUrl, tile, host }
        return e('div', {
          key: tile.id, className: 'ag-tile', 'data-drag': drag.current === i, 'data-over': false,
          style: { gridColumn: 'span ' + clamp(tile.w, 2, COLS), gridRow: 'span ' + clamp(tile.h, 1, 16) },
          onDragOver: (ev) => ev.preventDefault(),
          onDragEnter: () => dropOn(i),
          onDragEnd: () => { drag.current = -1 }
        },
          e('div', { className: 'ag-hd', draggable: edit, onDragStart: () => { drag.current = i } },
            e('span', { className: 'ag-glyph' }, d.glyph), d.label,
            e('div', { className: 'ag-tools' },
              e('button', { className: 'ag-tool', title: 'настроить', onClick: () => openSheet(tile.id) }, '⚙'),
              e('button', { className: 'ag-tool', title: 'в браузере: первая ссылка', onClick: () => { const u = cfgOf(tile).url || (arr(cfgOf(tile).items)[0] || {}).u; if (u) openUrl(u) } }, '↗'),
              e('button', { className: 'ag-tool', title: 'убрать', onClick: () => delTile(tile.id) }, '×'))),
          e('div', { className: 'ag-body' }, e(TileBody, { key: tile.type, d, env })),
          e('div', { className: 'ag-grip', onPointerDown: (ev) => resize(ev, tile) }))
      }),
      edit ? e('button', { key: 'add', className: 'ag-tile ag-add', onClick: () => setSheet('add'), title: 'добавить виджет' }, '+') : null),

    sheet === 'add' ? e('div', { className: 'ag-modal', onClick: () => setSheet(null) }, e('div', { className: 'ag-sheet', onClick: (ev) => ev.stopPropagation() },
      e('h3', null, ORDER.length + ' виджетов'),
      e('div', { className: 'ag-pick' }, ORDER.map((type) => e('button', { key: type, onClick: () => addTile(type) },
        e('b', null, WIDGETS[type].glyph + '  ' + WIDGETS[type].label), e('small', null, WIDGETS[type].hint || 'локально, без сети'))))) )
      : null,

    sheet && sheet !== 'add' && sheet !== 'style' ? (() => {
      const tile = tiles.find((t) => t.id === sheet)
      if (!tile) return null
      const json = cfgDraft == null ? JSON.stringify(cfgOf(tile), null, 1) : cfgDraft
      return e('div', { className: 'ag-modal', onClick: () => setSheet(null) }, e('div', { className: 'ag-sheet', onClick: (ev) => ev.stopPropagation() },
        e('h3', null, 'Настройка · ' + (WIDGETS[tile.type] || {}).label),
        e(Textarea, { className: 'ag-ta', style: { minHeight: 220 }, value: cfgDraft,
          onChange: (ev) => setCfgDraft(ev.target.value) }),
        e('div', { className: 'ag-row', style: { marginTop: 8 } },
          e('button', { className: 'ag-btn', onClick: () => {
            try { setCfg(tile.id, JSON.parse(cfgDraft)); setSheet(null); host.notify({ kind: 'info', message: 'Anori: конфиг применён' }) }
            catch (err) { host.notify({ kind: 'error', message: 'Anori: битый JSON — ' + err.message }) }
          } }, 'применить'),
          e('span', { className: 'ag-tiny' }, 'cfg хранится в ctx.storage плагина'))))
    })() : null,

    sheet === 'style' ? e('div', { className: 'ag-modal', onClick: () => setSheet(null) }, e('div', { className: 'ag-sheet', onClick: (ev) => ev.stopPropagation() },
      e('h3', null, 'Тема папки'),
      e('div', { className: 'ag-pick' }, Object.keys(THEMES).map((k) => e('button', { key: k, onClick: () => touch((f) => ({ ...f, theme: k })) },
        e('b', null, THEMES[k].label), e('small', null, THEMES[k].accent)))),
      e('h3', { style: { marginTop: 14 } }, 'Фон'),
      e('div', { className: 'ag-pick' }, Object.keys(WALLS).map((k) => e('button', { key: k, onClick: () => touch((f) => ({ ...f, wall: k })) },
        e('b', null, WALLS[k].label), e('small', null, k === 'none' ? 'градиент темы' : 'css')))),
      e('h3', { style: { marginTop: 14 } }, 'Ссылка на свою картинку'),
      e(Input, { className: 'ag-in', placeholder: 'https://… (подставится как background)', onBlur: (ev) => touch((f) => ({ ...f, wall: 'none', theme: f.theme, photo: ev.target.value })) }),
      )) : null
  ))
}


// ---------------------------------------------------------------- entry
export default {
  id: ID,
  name: 'Anori Grid',
  description: 'Anori-подобная стартовая страница в Hermes Desktop: папки, drag/resize сетка, 32 виджета, ссылки открываются в системном браузере.',
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    ctx.onDispose(() => style.remove())
    startNow()
    ctx.onDispose(() => { if (nowTimer) clearInterval(nowTimer); nowTimer = null })

    ctx.register({ id: 'page', area: ROUTES_AREA, data: { path: PAGE }, render: () => jsx(App, { ctx }) })
    ctx.register({
      id: 'nav', area: SIDEBAR_NAV_AREA,
      data: { path: PAGE, label: 'Anori', codicon: 'home' }
    })
    ctx.register({
      id: 'open', area: PALETTE_AREA,
      data: { id: ID + '.open', label: 'Anori: открыть страницу', keywords: ['anori', 'home', 'dashboard', 'start'], run: () => host.navigate(PAGE) }
    })
    ctx.register({
      id: 'chip', area: STATUSBAR_AREAS.right, order: 20,
      render: () => e('button', { className: 'ag-btn', title: 'Anori grid', onClick: () => host.navigate(PAGE) }, '◧ Anori')
    })
  }
}
