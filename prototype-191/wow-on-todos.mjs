// #191 決定 2 · 若待辦列掛 WoW delta，實際有幾格畫得出東西？
import fs from 'node:fs'
const DIR = '.tmp/scratch/ga-history'
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()

function wilson(obs, n) {
  if (!n) return [0, 1]
  const z = 1.959963985, p = obs / n
  const d = 1 + (z * z) / n, c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}
const RULES = [
  { id: 'batch.failRate', cat: 'A', th: 0.10, dir: 'high', label: '批量失敗率', p: b => [b.glance.batch.fails, b.glance.batch.starts] },
  { id: 'bom.handoffPct', cat: 'B', th: 0.15, dir: 'low', label: 'BOM→批量交棒率', p: b => [b.glance.bom.sentToBatch, b.glance.bom.calculates] },
  { id: 'batch.completePct', cat: 'B', th: 0.85, dir: 'low', label: '批量完成率', p: b => [b.glance.batch.completes, b.glance.batch.starts] },
]
const days = []
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'))
  if (!s.windows?.['28d'] || !s.windows?.['7d']) continue
  days.push({ date: f.replace('.json', ''), w28: s.windows['28d'], w7: s.windows['7d'] })
}

console.log(`${days.length} 天 · 對「當期實際會出現在待辦上的三條」逐日檢查 WoW delta 是否顯著\n`)
console.log('規則                 觸發天數  其中 WoW 顯著  佔比    → 待辦上這格是空的機率')
let totRows = 0, totSig = 0
for (const r of RULES) {
  let fired = 0, sig = 0
  for (let i = 7; i < days.length; i++) {
    const [o, n] = r.p(days[i].w28)
    if (!n || n < 30) continue
    const [lo, hi] = wilson(o, n)
    const isFired = r.dir === 'low' ? hi < r.th : lo > r.th
    if (!isFired) continue
    fired++
    const [ao, an] = r.p(days[i - 7].w7), [bo, bn] = r.p(days[i].w7)
    if (!an || !bn) continue
    const [alo, ahi] = wilson(ao, an), [blo, bhi] = wilson(bo, bn)
    if (bhi < alo || blo > ahi) sig++
  }
  totRows += fired; totSig += sig
  console.log(`${r.label.padEnd(20)} ${String(fired).padStart(6)} ${String(sig).padStart(12)} ${((100 * sig) / fired).toFixed(0).padStart(6)}%${String(Math.round(100 - (100 * sig) / fired)).padStart(24)}%`)
}
console.log(`\n合計 ${totRows} 個「待辦列 × 天」中，delta 欄畫得出箭頭的只有 ${totSig} 個 = ${((100 * totSig) / totRows).toFixed(0)}%`)
console.log(`→ 待辦上的 delta 欄有 ${(100 - (100 * totSig) / totRows).toFixed(0)}% 的時候是「—　波動不顯著」`)
