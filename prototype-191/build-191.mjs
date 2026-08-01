// #191 原型 builder — 讀 72 份日快照，產出「待辦區塊」四變體
import fs from 'node:fs'

const DIR = '.tmp/scratch/ga-history'
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()

function wilson(obs, n) {
  if (!n) return [0, 1]
  const z = 1.959963985, p = obs / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}

const RULES = [
  { id: 'batch.failRate', cat: 'A', label: '批量失敗率', dir: 'high', th: 0.10,
    next: '看失敗原因分佈，找出主導那一項', anchor: '主要失敗原因',
    pick: b => [{ obs: b.glance.batch.fails, n: b.glance.batch.starts }] },
  { id: 'solver.failRate', cat: 'A', label: 'solver 失敗率', dir: 'high', th: 0.02, trusted: false,
    next: '—', anchor: '主要失敗原因',
    pick: b => [{ obs: b.glance.solver.fails, n: b.glance.solver.starts }] },
  { id: 'bom.handoffPct', cat: 'B', label: 'BOM→批量交棒率', dir: 'low', th: 0.15,
    next: 'BOM 算完後沒有進批量的入口？看漏斗', anchor: '頁面流失率',
    pick: b => [{ obs: b.glance.bom.sentToBatch, n: b.glance.bom.calculates }] },
  { id: 'batch.completePct', cat: 'B', label: '批量完成率', dir: 'low', th: 0.85,
    next: '完成率掉在哪一步？看批量漏斗', anchor: '批量漏斗',
    pick: b => [{ obs: b.glance.batch.completes, n: b.glance.batch.starts }] },
  { id: 'funnel', cat: 'B', label: '漏斗', dir: 'low', th: 0.30,
    next: '這段轉換為什麼掉？看該段前後的頁面停留', anchor: '頁面流失率',
    pick: b => (b.q4Funnels || []).map(f => ({ obs: f.to, n: f.from, suffix: f.name })) },
  { id: 'misuse.large_queue_in_simulator', cat: 'C', label: '誤用 · 模擬器塞入大量佇列', dir: 'high', th: 0.03,
    next: '模擬器該不該直接提供「送去批量」？', anchor: '誤用訊號',
    pick: b => pickMisuse(b, 'large_queue_in_simulator') },
  { id: 'misuse.single_recipe_in_batch', cat: 'C', label: '誤用 · 批量頁只放單一配方', dir: 'high', th: 0.10,
    next: '批量頁要不要在單一配方時導回模擬器？', anchor: '誤用訊號',
    pick: b => pickMisuse(b, 'single_recipe_in_batch') },
  { id: 'misuse.bom_without_quantity', cat: 'C', label: '誤用 · BOM 未填數量', dir: 'high', th: 0.06,
    next: 'BOM 數量欄要不要給預設值？', anchor: '誤用訊號',
    pick: b => pickMisuse(b, 'bom_without_quantity') },
]
function pickMisuse(b, type) {
  const m = (b.misuseSignals || []).find(x => x.type === type)
  return m ? [{ obs: m.affectedUsers, n: b.glance.activeUsers.total }] : []
}

function evaluate(b) {
  const out = new Map()
  for (const r of RULES) {
    let picks = []
    try { picks = r.pick(b) || [] } catch { picks = [] }
    for (const p of picks) {
      if (!Number.isFinite(p.obs) || !Number.isFinite(p.n)) continue
      const id = p.suffix ? `${r.id}:${p.suffix}` : r.id
      const val = p.n ? p.obs / p.n : 0
      let blocked = null
      if (r.trusted === false) blocked = 'not-trusted'
      else if (p.n < 30) blocked = 'insufficient-n'
      let fired = false
      if (!blocked) {
        const [lo, hi] = wilson(p.obs, p.n)
        fired = r.dir === 'low' ? hi < r.th : lo > r.th
        if (!fired) blocked = 'ci-overlap'
      }
      out.set(id, {
        id, cat: r.cat, dir: r.dir, th: r.th, next: r.next, anchor: r.anchor,
        label: p.suffix ? `${r.label} · ${p.suffix}` : r.label,
        obs: p.obs, n: p.n, val, fired, blocked,
        gap: (r.dir === 'low' ? r.th - val : val - r.th) / r.th,
      })
    }
  }
  return out
}

// 逐日：28d 判定 + 7d 值（給 sparkline / WoW）
const days = []
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'))
  if (!s.windows?.['28d']) continue
  days.push({
    date: f.replace('.json', ''),
    v28: evaluate(s.windows['28d']),
    v7: s.windows['7d'] ? evaluate(s.windows['7d']) : new Map(),
  })
}
const last = days[days.length - 1]
const ids = [...last.v28.keys()]

// 連續亮起天數 / 上一次熄滅
function streak(id) {
  let k = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i].v28.get(id)
    if (v?.fired) k++
    else break
  }
  return k
}
function firedOn(id, i) { return !!days[i]?.v28.get(id)?.fired }

// WoW delta（7d vs 前 7d 非重疊，Wilson CI 閘門）
function wow(id) {
  const i = days.length - 1, j = days.length - 8
  const a = days[j]?.v7.get(id), b = days[i]?.v7.get(id)
  if (!a || !b || !a.n || !b.n) return { sig: false }
  const [alo, ahi] = wilson(a.obs, a.n), [blo, bhi] = wilson(b.obs, b.n)
  const sig = bhi < alo || blo > ahi
  return { sig, d: b.val - a.val, from: a.val, to: b.val }
}

// 7d 序列（最近 56 天）
function series(id, n = 56) {
  return days.slice(-n).map(d => { const v = d.v7.get(id); return v && v.n ? v.val : null })
}

const ranked = ids.map(id => last.v28.get(id)).filter(v => v.fired)
  .sort((a, b) => ({ A: 0, B: 1, C: 2, D: 3 })[a.cat] - ({ A: 0, B: 1, C: 2, D: 3 })[b.cat] || b.gap - a.gap)
const top3 = ranked.slice(0, 3)
const rest = ranked.slice(3)

// 這期熄滅的（昨天亮 / 這期不亮）— 用 7 天前當「上週」比較點
const wentDark = ids.map(id => last.v28.get(id))
  .filter(v => !v.fired && firedOn(v.id, days.length - 8))
  .map(v => {
    const prev = days[days.length - 8].v28.get(v.id)
    let darkFor = 0
    for (let i = days.length - 1; i >= 0; i--) { if (firedOn(v.id, i)) break; darkFor++ }
    return { ...v, prevVal: prev.val, darkFor }
  })

const near = ids.map(id => last.v28.get(id)).filter(v => !v.fired && v.blocked === 'ci-overlap')
  .sort((a, b) => b.gap - a.gap).slice(0, 3)

// ---- 72 天證據表 ----
const evidence = ids.map(id => {
  const bools = days.map(d => !!d.v28.get(id)?.fired)
  let appears = 0, disappears = 0
  for (let i = 1; i < bools.length; i++) {
    if (!bools[i - 1] && bools[i]) appears++
    if (bools[i - 1] && !bools[i]) disappears++
  }
  return { id, label: last.v28.get(id).label, cat: last.v28.get(id).cat, bools, appears, disappears, nFired: bools.filter(Boolean).length }
}).sort((a, b) => b.nFired - a.nFired)

const churn = (() => {
  let m = 0
  const t = days.map(d => {
    const r = [...d.v28.values()].filter(v => v.fired)
      .sort((a, b) => ({ A: 0, B: 1, C: 2, D: 3 })[a.cat] - ({ A: 0, B: 1, C: 2, D: 3 })[b.cat] || b.gap - a.gap)
      .slice(0, 3).map(v => v.id)
    return r
  })
  for (let i = 1; i < t.length; i++) {
    const a = new Set(t[i - 1]), b = new Set(t[i])
    if ([...b].some(x => !a.has(x)) || [...a].some(x => !b.has(x))) m++
  }
  return { memberChange: m, total: t.length - 1 }
})()

// ================= render =================
const pct = v => (100 * v).toFixed(1) + '%'
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

function sparkSVG(id, opts = {}) {
  const data = series(id)
  const w = 132, h = 30, pad = 3
  const v = data.filter(x => x !== null)
  if (!v.length) return ''
  const th = last.v28.get(id).th
  const lo = Math.min(...v, th) * 0.96, hi = Math.max(...v, th) * 1.04
  const x = i => pad + (i * (w - 2 * pad)) / (data.length - 1)
  const y = val => h - pad - ((val - lo) / (hi - lo || 1)) * (h - 2 * pad)
  let d = '', pen = false
  data.forEach((val, i) => {
    if (val === null) { pen = false; return }
    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1) + ' '
    pen = true
  })
  const lastI = data.reduce((m, val, i) => (val !== null ? i : m), -1)
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <line x1="0" y1="${y(th).toFixed(1)}" x2="${w}" y2="${y(th).toFixed(1)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>
    <path d="${d}" fill="none" stroke="${opts.stroke || 'var(--ink-mid)'}" stroke-width="1.6" stroke-linejoin="round"/>
    ${lastI >= 0 ? `<circle cx="${x(lastI).toFixed(1)}" cy="${y(data[lastI]).toFixed(1)}" r="2.6" fill="var(--danger)"/>` : ''}
  </svg>`
}

function deltaCell(id) {
  const w = wow(id)
  if (!w.sig) return `<div class="delta flat">—<small>波動不顯著</small></div>`
  const dir = last.v28.get(id).dir
  const good = dir === 'low' ? w.d > 0 : w.d < 0
  const arrow = w.d > 0 ? '▲' : '▼'
  return `<div class="delta ${good ? 'up' : 'down'}">${arrow} ${(100 * Math.abs(w.d)).toFixed(1)}pp<small>vs 上週</small></div>`
}

function ageBadge(id) {
  const k = streak(id)
  if (k <= 7) return `<span class="age new">✦ 本週新亮</span>`
  if (k >= 30) return `<span class="age old">連續 ${k} 天</span>`
  return `<span class="age mid">連續 ${k} 天</span>`
}

// ---- 變體 A：#183 原案，零趨勢 ----
const A = top3.map(v => `
  <div class="todo">
    <div class="cat">[${v.cat}] ${{ A: '修 BUG', B: 'UX 摩擦', C: '功能', D: '效能' }[v.cat]}</div>
    <div class="body">
      <div class="line1">★ ${esc(v.label)} <b>${pct(v.val)}</b></div>
      <div class="line2">門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
      <div class="line3">→ ${esc(v.next)} <span class="anchor">⤳ ${esc(v.anchor)}</span></div>
    </div>
    <div class="gapv">${(100 * v.gap).toFixed(0)}%</div>
  </div>`).join('')

// ---- 變體 B：沿用 D 組合 ----
const B = top3.map(v => `
  <div class="todo wide">
    <div class="cat">[${v.cat}] ${{ A: '修 BUG', B: 'UX 摩擦', C: '功能', D: '效能' }[v.cat]}</div>
    <div class="body">
      <div class="line1">★ ${esc(v.label)} <b>${pct(v.val)}</b></div>
      <div class="line2">門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
      <div class="line3">→ ${esc(v.next)} <span class="anchor">⤳ ${esc(v.anchor)}</span></div>
    </div>
    ${deltaCell(v.id)}
    ${sparkSVG(v.id)}
    <div class="gapv">${(100 * v.gap).toFixed(0)}%</div>
  </div>`).join('')

// ---- 變體 C：年資標記，無圖 ----
const C = top3.map(v => `
  <div class="todo">
    <div class="cat">[${v.cat}] ${{ A: '修 BUG', B: 'UX 摩擦', C: '功能', D: '效能' }[v.cat]}</div>
    <div class="body">
      <div class="line1">★ ${esc(v.label)} <b>${pct(v.val)}</b> ${ageBadge(v.id)}</div>
      <div class="line2">門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
      <div class="line3">→ ${esc(v.next)} <span class="anchor">⤳ ${esc(v.anchor)}</span></div>
    </div>
    <div class="gapv">${(100 * v.gap).toFixed(0)}%</div>
  </div>`).join('')

// ---- 變體 D：年資標記 + 熄滅留痕 ----
const darkRows = wentDark.length ? wentDark.map(v => `
  <div class="todo dark">
    <div class="cat">熄滅</div>
    <div class="body">
      <div class="line1">✓ ${esc(v.label)} <b>${pct(v.val)}</b> <span class="age gone">已連續 ${v.darkFor} 天未觸發</span></div>
      <div class="line2">上週 ${pct(v.prevVal)} · 門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
    </div>
  </div>`).join('') : `<div class="empty-inline">本期沒有待辦熄滅。</div>`

const D = C + `<div class="divider-label">本期熄滅</div>` + darkRows

// ---- 定案：三級年資 + 對稱 CI 熄滅 + 28 天保留 ----
function ciState(v) {
  if (!v || v.n < 30) return 'absent'
  const [lo, hi] = wilson(v.obs, v.n)
  if (v.dir === 'low' ? hi < v.th : lo > v.th) return 'fire'
  if (v.dir === 'low' ? lo > v.th : hi < v.th) return 'clear'
  return 'grey'
}
function ageBadge3(id) {
  const k = streak(id)
  if (k >= days.length) return `<span class="age span">觀測全期未曾解決</span>`
  if (k <= 7) return `<span class="age new">✦ 本週新亮</span>`
  return `<span class="age old">連續 ${k} 天</span>`
}
// 對稱 CI 熄滅：今天 clear、且往回找得到最後一次 fire、且距今 ≤28 天
const resolved = ids.map(id => {
  const cur = last.v28.get(id)
  if (ciState(cur) !== 'clear') return null
  let lastFire = -1
  for (let i = days.length - 1; i >= 0; i--) if (ciState(days[i].v28.get(id)) === 'fire') { lastFire = i; break }
  if (lastFire < 0) return null
  const ago = days.length - 1 - lastFire
  if (ago > 28) return null
  return { ...cur, lastFireDate: days[lastFire].date, lastFireVal: days[lastFire].v28.get(id).val, ago }
}).filter(Boolean)

const FINAL = top3.map(v => `
  <div class="todo">
    <div class="cat">[${v.cat}] ${{ A: '修 BUG', B: 'UX 摩擦', C: '功能', D: '效能' }[v.cat]}</div>
    <div class="body">
      <div class="line1">★ ${esc(v.label)} <b>${pct(v.val)}</b> ${ageBadge3(v.id)}</div>
      <div class="line2">門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
      <div class="line3">→ ${esc(v.next)} <span class="anchor">⤳ ${esc(v.anchor)}</span></div>
    </div>
    <div class="gapv">${(100 * v.gap).toFixed(0)}%</div>
  </div>`).join('')
  + `<div class="divider-label">本期熄滅</div>`
  + (resolved.length ? resolved.map(v => `
  <div class="todo dark">
    <div class="cat">熄滅</div>
    <div class="body">
      <div class="line1">✓ ${esc(v.label)} <b>${pct(v.val)}</b></div>
      <div class="line2">上次觸發 ${v.lastFireDate}（${pct(v.lastFireVal)}）· 門檻 ${pct(v.th)} · ${v.obs}/${v.n}</div>
    </div>
  </div>`).join('') : `<div class="empty-inline">本期沒有待辦熄滅。</div>`)

// 證據面板
const strip = e => e.bools.map(b => `<i class="${b ? 'on' : 'off'}"></i>`).join('')
const evRows = evidence.map(e => `
  <tr>
    <td class="c">${e.cat}</td>
    <td>${esc(e.label)}</td>
    <td class="num">${e.nFired}/${e.bools.length}</td>
    <td class="num">${((100 * e.nFired) / e.bools.length).toFixed(0)}%</td>
    <td class="num">${e.appears}</td>
    <td class="num">${e.disappears}</td>
    <td class="strip">${strip(e)}</td>
  </tr>`).join('')

const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<title>PROTOTYPE — 待辦條目旁的回饋迴路呈現（#191）</title>
<style>
:root{--bg:oklch(0.18 0.018 62);--bg-deep:oklch(0.14 0.014 60);--surface:oklch(0.225 0.018 62);--surface-2:oklch(0.26 0.022 62);--border:oklch(0.42 0.035 60/0.36);--border-soft:oklch(0.42 0.035 60/0.18);--ink:oklch(0.94 0.022 82);--ink-mid:oklch(0.80 0.022 75);--ink-muted:oklch(0.66 0.024 68);--ink-faint:oklch(0.52 0.028 62);--gold:oklch(0.78 0.15 72);--cocoa:oklch(0.66 0.14 40);--matcha:oklch(0.72 0.15 138);--blueberry:oklch(0.66 0.16 248);--success:oklch(0.70 0.16 145);--warning:oklch(0.74 0.16 60);--danger:oklch(0.68 0.20 22);}
*{box-sizing:border-box}
body{margin:0;padding:0 0 110px;background:radial-gradient(1200px 700px at 20% -10%,oklch(0.26 0.04 60/.55),transparent 60%),radial-gradient(900px 600px at 95% 8%,oklch(0.24 0.05 40/.40),transparent 65%),var(--bg);color:var(--ink);font-family:'Noto Sans TC',system-ui,sans-serif;font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1560px;margin:0 auto;padding:40px 48px}
.proto-banner{background:repeating-linear-gradient(45deg,oklch(0.30 0.05 60/.5) 0 12px,transparent 12px 24px);border:1px dashed var(--gold);border-radius:10px;padding:10px 18px;margin-bottom:32px;font-size:13px;color:var(--gold);letter-spacing:.04em}
h1{font-size:30px;margin:0 0 6px;letter-spacing:-.01em}
.sub{color:var(--ink-muted);margin:0 0 36px;font-size:14px}
h2{font-size:20px;margin:0 0 4px}
h2 .tag{font-size:11px;font-weight:600;letter-spacing:.1em;color:var(--bg-deep);background:var(--gold);padding:3px 9px;border-radius:5px;vertical-align:3px;margin-right:12px}
.lede{color:var(--ink-muted);font-size:14px;margin:0 0 20px;max-width:92ch}
.lede b{color:var(--ink-mid)}
.card{background:var(--surface);border:1px solid var(--border-soft);border-radius:14px;padding:8px 30px 20px;margin:0 0 34px}
.sechead{display:flex;align-items:baseline;gap:12px;padding:18px 0 10px;border-bottom:1px solid var(--border);margin-bottom:4px}
.sechead h3{font-size:15px;margin:0;font-weight:600;letter-spacing:.02em}
.sechead .w{font-size:12px;color:var(--ink-faint)}
.todo{display:grid;grid-template-columns:120px 1fr 62px;gap:22px;align-items:start;padding:16px 0;border-bottom:1px solid var(--border-soft)}
.todo.wide{grid-template-columns:120px 1fr 92px 132px 62px;align-items:center}
.todo:last-child{border-bottom:0}
.cat{font-size:11px;color:var(--ink-faint);letter-spacing:.06em;padding-top:3px}
.line1{font-size:15px;color:var(--ink)}
.line1 b{font-variant-numeric:tabular-nums;color:var(--danger);font-size:19px;margin-left:6px}
.line2{font-size:12px;color:var(--ink-faint);font-variant-numeric:tabular-nums}
.line3{font-size:13px;color:var(--ink-mid);margin-top:5px}
.anchor{color:var(--blueberry);font-size:12px;margin-left:8px}
.gapv{text-align:right;font-size:17px;font-variant-numeric:tabular-nums;color:var(--warning)}
.delta{font-size:13px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.delta.up{color:var(--success)}.delta.down{color:var(--danger)}.delta.flat{color:var(--ink-faint)}
.delta small{display:block;font-size:10px;color:var(--ink-faint)}
.age{font-size:10px;padding:2px 8px;border-radius:4px;letter-spacing:.05em;border:1px solid var(--border);margin-left:8px;vertical-align:2px;white-space:nowrap}
.age.new{color:var(--bg-deep);background:var(--gold);border-color:var(--gold);font-weight:600}
.age.old{color:var(--ink-faint)}
.age.mid{color:var(--ink-muted)}
.age.gone{color:var(--success);border-color:oklch(0.70 0.16 145/.4)}
.age.span{color:var(--ink-muted);border-color:var(--ink-faint);border-style:dashed}
.todo.dark .line1{color:var(--ink-muted)}
.todo.dark .line1 b{color:var(--success)}
.divider-label{font-size:11px;color:var(--ink-faint);letter-spacing:.1em;padding:16px 0 2px;border-top:1px solid var(--border);margin-top:6px}
.empty-inline{font-size:13px;color:var(--ink-faint);padding:14px 0}
.foot{font-size:12px;color:var(--ink-faint);padding:14px 0 4px;border-top:1px solid var(--border-soft);margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-weight:600;color:var(--ink-faint);font-size:11px;letter-spacing:.06em;padding:6px 10px 6px 0;border-bottom:1px solid var(--border)}
td{padding:6px 10px 6px 0;border-bottom:1px solid var(--border-soft);vertical-align:middle}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.c{color:var(--ink-faint);font-size:11px}
.strip{line-height:0;white-space:nowrap}
.strip i{display:inline-block;width:4px;height:16px;margin-right:1px}
.strip i.on{background:var(--danger)}
.strip i.off{background:oklch(0.42 0.035 60/.28)}
.note{font-size:13px;color:var(--ink-muted);background:oklch(0.26 0.022 62/.6);border-left:2px solid var(--gold);padding:12px 18px;margin:16px 0 0;border-radius:0 8px 8px 0}
.note b{color:var(--ink)}
</style></head><body><div class="wrap">
<div class="proto-banner">PROTOTYPE · wayfinder #191「決定待辦條目旁的回饋迴路呈現」 · 丟棄式，不要 merge 進 main</div>
<h1>待辦條目旁的回饋迴路</h1>
<p class="sub">資料 = <b>${days.length}</b> 份真實日快照（${days[0].date} → ${last.date}），把 #181 門檻表 + #183 <code>evaluate()</code> 逐日套上去。所有數字都是真的。</p>

<h2><span class="tag">變體 A</span>純 deep-link（#183 原案）</h2>
<p class="lede">待辦不帶任何自己的歷史。想知道「這條上週在不在」得自己往下捲到 glance ledger。</p>
<div class="card"><div class="sechead"><h3>本期待辦</h3><span class="w">28 天</span></div>${A}
<div class="foot">另有 ${rest.length} 項超標未入選 ⌄　·　另有 5 個訊號因埋點待修不可用 · #187 ⤳</div></div>

<h2><span class="tag">變體 B</span>沿用 #184 的 D 組合</h2>
<p class="lede">每條待辦掛上 WoW delta（Wilson CI 閘門）與 7d sparkline（疊金色門檻線）—— 與 glance ledger 同一套語彙。</p>
<div class="card"><div class="sechead"><h3>本期待辦</h3><span class="w">28 天</span></div>${B}
<div class="foot">另有 ${rest.length} 項超標未入選 ⌄　·　另有 5 個訊號因埋點待修不可用 · #187 ⤳</div></div>

<h2><span class="tag">變體 C</span>只帶年資標記</h2>
<p class="lede">不畫圖，只回答一個問題：<b>這條是老面孔還是新亮的。</b></p>
<div class="card"><div class="sechead"><h3>本期待辦</h3><span class="w">28 天</span></div>${C}
<div class="foot">另有 ${rest.length} 項超標未入選 ⌄　·　另有 5 個訊號因埋點待修不可用 · #187 ⤳</div></div>

<h2><span class="tag">變體 D</span>年資標記 + 熄滅留痕</h2>
<p class="lede">C 再加上「上週在響、這期不響」的一段 —— 迴路真正閉合的地方。</p>
<div class="card"><div class="sechead"><h3>本期待辦</h3><span class="w">28 天</span></div>${D}
<div class="foot">另有 ${rest.length} 項超標未入選 ⌄　·　另有 5 個訊號因埋點待修不可用 · #187 ⤳</div></div>

<h2><span class="tag" style="background:var(--matcha)">定案</span>三級年資 + 對稱 CI 熄滅（保留 28 天）</h2>
<p class="lede">年資三級：<b>✦ 本週新亮</b>（≤7 天，金色實心）／<b>連續 N 天</b>（灰）／<b>觀測全期未曾解決</b>（灰·描邊）。熄滅用<b>對稱 CI</b> 宣告 —— 亮起與熄滅共用同一條 Wilson 規則、只是方向相反，CI 跨過門檻時是灰帶，既不亮也不宣告熄滅。無 delta 欄、無 sparkline。</p>
<div class="card"><div class="sechead"><h3>本期待辦</h3><span class="w">28 天</span></div>${FINAL}
<div class="foot">另有 ${rest.length} 項超標未入選 ⌄　·　另有 5 個訊號因埋點待修不可用 · #187 ⤳</div></div>

<h2>72 天實測：待辦的一生</h2>
<p class="lede">每條規則逐日跑 <code>evaluate()</code> 的結果。紅 = 觸發。</p>
<div class="card" style="padding-top:20px">
<table><thead><tr><th>類</th><th>規則</th><th class="num">觸發天數</th><th class="num">佔比</th><th class="num">亮起</th><th class="num">熄滅</th><th>${days[0].date} → ${last.date}</th></tr></thead><tbody>${evRows}</tbody></table>
<div class="note">
<b>待辦幾乎不動。</b> 前 3 名的成員在 ${churn.total} 次日對日比較裡只變動 <b>${churn.memberChange}</b> 次（${((100 * churn.memberChange) / churn.total).toFixed(0)}%）。<br>
<b>「新亮起」與「熄滅」都是稀缺事件。</b> ${days.length} 天內全部規則加總只有 ${evidence.reduce((s, e) => s + e.appears, 0)} 次亮起、${evidence.reduce((s, e) => s + e.disappears, 0)} 次熄滅。<br>
<b>從來沒有空狀態。</b> ${days.length} 天裡最少的一天也有 1 條待辦在響。
</div>
</div>
</div></body></html>`

fs.mkdirSync('.tmp/scratch/proto-191', { recursive: true })
fs.writeFileSync('.tmp/scratch/proto-191/todo-feedback-proto.html', html)
console.log('wrote .tmp/scratch/proto-191/todo-feedback-proto.html')
console.log('\n本期待辦（' + last.date + '）：')
top3.forEach((v, i) => console.log(`  ${i + 1}. [${v.cat}] ${v.label} ${pct(v.val)} · 連續 ${streak(v.id)} 天 · WoW ${JSON.stringify(wow(v.id))}`))
console.log('未入選：', rest.map(v => v.label).join(', ') || '(無)')
console.log('本期熄滅：', wentDark.map(v => `${v.label}（暗 ${v.darkFor} 天）`).join(', ') || '(無)')
console.log('近門檻：', near.map(v => `${v.label} ${pct(v.val)}`).join(', '))
