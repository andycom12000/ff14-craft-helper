// #191 — 把 #181/#183 的門檻表套到 72 份日快照上，量測「待辦的一生」
import fs from 'node:fs'

const DIR = '.tmp/scratch/ga-history'
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()

// ---- Wilson 95% CI（#181 決定 3）----
function wilson(obs, n) {
  if (!n) return [0, 1]
  const z = 1.959963985
  const p = obs / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}

// ---- 門檻表（#181 定義表 + #183 決定 4 的 trusted 名單）----
const RULES = [
  { id: 'solver.failRate', cat: 'A', label: 'solver 失敗率', dir: 'high', th: 0.02, trusted: false,
    pick: b => [{ obs: b.glance.solver.fails, n: b.glance.solver.starts }] },
  { id: 'batch.failRate', cat: 'A', label: '批量失敗率', dir: 'high', th: 0.10,
    pick: b => [{ obs: b.glance.batch.fails, n: b.glance.batch.starts }] },
  { id: 'solver.completePct', cat: 'B', label: 'solver 完成率', dir: 'low', th: 0.85, trusted: false,
    pick: b => [{ obs: b.glance.solver.completes, n: b.glance.solver.starts }] },
  { id: 'batch.completePct', cat: 'B', label: '批量完成率', dir: 'low', th: 0.85,
    pick: b => [{ obs: b.glance.batch.completes, n: b.glance.batch.starts }] },
  { id: 'bom.handoffPct', cat: 'B', label: 'BOM→批量交棒率', dir: 'low', th: 0.15,
    pick: b => [{ obs: b.glance.bom.sentToBatch, n: b.glance.bom.calculates }] },
  { id: 'funnel', cat: 'B', label: '漏斗', dir: 'low', th: 0.30,
    pick: b => (b.q4Funnels || []).map(f => ({ obs: f.to, n: f.from, suffix: f.name })) },
  { id: 'misuse.single_recipe_in_batch', cat: 'C', label: '誤用 · 批量頁只放單一配方', dir: 'high', th: 0.10,
    pick: b => pickMisuse(b, 'single_recipe_in_batch') },
  { id: 'misuse.large_queue_in_simulator', cat: 'C', label: '誤用 · 模擬器塞入大量佇列', dir: 'high', th: 0.03,
    pick: b => pickMisuse(b, 'large_queue_in_simulator') },
  { id: 'misuse.bom_without_quantity', cat: 'C', label: '誤用 · BOM 未填數量', dir: 'high', th: 0.06,
    pick: b => pickMisuse(b, 'bom_without_quantity') },
  { id: 'vitals', cat: 'D', label: 'Vitals', dir: 'low', th: 0.75,
    pick: b => (b.vitals || []).map(v => ({ obs: v.good, n: v.good + v.ni + v.poor, suffix: v.metric })) },
  // 觀測層（actionable:false）— 永不觸發，但趨勢要畫
  { id: 'returningPct', cat: 'B', label: '回訪率', dir: 'low', th: 0.35, actionable: false,
    pick: b => [{ obs: b.glance.activeUsers.returning, n: b.glance.activeUsers.total }] },
  { id: 'sabUnavailPct', cat: 'A', label: 'SAB 不可用率', dir: 'high', th: 0.06, actionable: false,
    pick: b => [{ obs: b.glance.infra.sabUnavailable, n: b.glance.activeUsers.total }] },
]

function pickMisuse(b, type) {
  const m = (b.misuseSignals || []).find(x => x.type === type)
  if (!m) return []
  return [{ obs: m.affectedUsers, n: b.glance.activeUsers.total }]
}

function evaluate(b) {
  const out = []
  for (const r of RULES) {
    let picks = []
    try { picks = r.pick(b) || [] } catch { picks = [] }
    for (const p of picks) {
      if (!Number.isFinite(p.obs) || !Number.isFinite(p.n)) continue
      const id = p.suffix ? `${r.id}:${p.suffix}` : r.id
      const label = p.suffix ? `${r.label} · ${p.suffix}` : r.label
      const val = p.n ? p.obs / p.n : 0
      let blockedBy = null
      if (r.actionable === false) blockedBy = 'not-actionable'
      else if (r.trusted === false) blockedBy = 'not-trusted'
      else if (p.n < 30) blockedBy = 'insufficient-n'
      let fired = false
      if (!blockedBy) {
        const [lo, hi] = wilson(p.obs, p.n)
        fired = r.dir === 'low' ? hi < r.th : lo > r.th
        if (!fired) blockedBy = 'ci-overlap'
      }
      const gap = (r.dir === 'low' ? r.th - val : val - r.th) / r.th
      out.push({ id, label, cat: r.cat, obs: p.obs, n: p.n, val, th: r.th, dir: r.dir, fired, gap, blockedBy })
    }
  }
  return out
}

const CAT_ORDER = { A: 0, B: 1, C: 2, D: 3 }
function rank(verdicts) {
  return verdicts.filter(v => v.fired)
    .sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat] || b.gap - a.gap)
}

// ---- 逐日跑 ----
const days = []
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'))
  const b = s.windows?.['28d']
  if (!b) continue
  const date = f.replace('.json', '')
  const verdicts = evaluate(b)
  const ranked = rank(verdicts)
  days.push({ date, verdicts, ranked, top3: ranked.slice(0, 3).map(v => v.id) })
}

// ---- 分析 ----
const allIds = [...new Set(days.flatMap(d => d.verdicts.map(v => v.id)))]
const label = id => days.map(d => d.verdicts.find(v => v.id === id)).find(Boolean)?.label ?? id
const cat = id => days.map(d => d.verdicts.find(v => v.id === id)).find(Boolean)?.cat ?? '?'

function runs(bools) {
  const segs = []
  let start = null
  bools.forEach((b, i) => {
    if (b && start === null) start = i
    if (!b && start !== null) { segs.push([start, i - 1]); start = null }
  })
  if (start !== null) segs.push([start, bools.length - 1])
  return segs
}

console.log('=== 每條規則的觸發史（72 天 · 28d 視窗 · 2026-05-19 → 07-31）===')
console.log('cat  rule                              fired  fire%   亮起  熄滅  最長連續  現況')
const summary = []
for (const id of allIds) {
  const bools = days.map(d => d.verdicts.find(v => v.id === id)?.fired ?? false)
  const present = days.map(d => !!d.verdicts.find(v => v.id === id))
  const nPresent = present.filter(Boolean).length
  const segs = runs(bools)
  let appears = 0, disappears = 0
  for (let i = 1; i < bools.length; i++) {
    if (!bools[i - 1] && bools[i]) appears++
    if (bools[i - 1] && !bools[i]) disappears++
  }
  const nFired = bools.filter(Boolean).length
  const longest = segs.reduce((m, s) => Math.max(m, s[1] - s[0] + 1), 0)
  summary.push({ id, cat: cat(id), label: label(id), bools, segs, appears, disappears, nFired, nPresent, longest, now: bools[bools.length - 1] })
}
summary.sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat] || b.nFired - a.nFired)
for (const s of summary) {
  console.log(
    ` ${s.cat}   ${s.label.padEnd(30).slice(0, 30)} ${String(s.nFired).padStart(4)}/${String(s.nPresent).padEnd(3)} ${((100 * s.nFired) / s.nPresent).toFixed(0).padStart(4)}%  ${String(s.appears).padStart(4)}  ${String(s.disappears).padStart(4)}   ${String(s.longest).padStart(6)}   ${s.now ? '★亮' : '  暗'}`,
  )
}

console.log('\n=== 熄滅事件明細（是修好了還是掉進噪音？）===')
for (const s of summary) {
  if (s.disappears === 0) continue
  for (let i = 1; i < s.bools.length; i++) {
    if (s.bools[i - 1] && !s.bools[i]) {
      // 熄滅後幾天再亮？
      let back = null
      for (let j = i; j < s.bools.length; j++) if (s.bools[j]) { back = j - i + 1; break }
      const v = days[i].verdicts.find(x => x.id === s.id)
      const prev = days[i - 1].verdicts.find(x => x.id === s.id)
      const tail = back === null ? '之後再也沒亮' : `${back} 天後又亮`
      if (!v) {
        console.log(`  ${s.label.padEnd(26).slice(0, 26)} ${days[i].date}  ${(100 * prev.val).toFixed(1)}% → 【指標本身從資料裡消失】  ${tail}`)
        continue
      }
      console.log(
        `  ${s.label.padEnd(26).slice(0, 26)} ${days[i].date}  ` +
        `${(100 * prev.val).toFixed(1)}% → ${(100 * v.val).toFixed(1)}% (門檻 ${(100 * v.th).toFixed(0)}%)  ` +
        `n ${prev.n}→${v.n}  擋下原因=${v.blockedBy}  ${tail}`,
      )
    }
  }
}

console.log('\n=== 本期待辦（前 3）的日對日 churn ===')
let churnDays = 0, memberChanges = 0
for (let i = 1; i < days.length; i++) {
  const a = new Set(days[i - 1].top3), b = new Set(days[i].top3)
  const changed = days[i - 1].top3.join('|') !== days[i].top3.join('|')
  const setChanged = [...b].some(x => !a.has(x)) || [...a].some(x => !b.has(x))
  if (setChanged) { churnDays++; memberChanges++ }
  else if (changed) churnDays++
}
console.log(`  名單成員變動天數：${memberChanges} / ${days.length - 1}`)
console.log(`  含順序變動：${churnDays} / ${days.length - 1}`)
console.log(`  待辦數量分佈：`, JSON.stringify(days.reduce((m, d) => { m[d.ranked.length] = (m[d.ranked.length] || 0) + 1; return m }, {})))

console.log('\n=== 最後 14 天的待辦清單 ===')
for (const d of days.slice(-14)) {
  console.log(`  ${d.date}  ${d.top3.map(id => label(id)).join('  |  ') || '(空)'}${d.ranked.length > 3 ? `   +${d.ranked.length - 3} 未入選` : ''}`)
}

fs.writeFileSync('.tmp/scratch/verdict-history.json', JSON.stringify({
  days: days.map(d => ({ date: d.date, verdicts: d.verdicts, top3: d.top3, nFired: d.ranked.length })),
}))
console.log(`\nverdict-history.json = ${(fs.statSync('.tmp/scratch/verdict-history.json').size / 1024).toFixed(1)} KB`)
