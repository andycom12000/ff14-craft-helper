import fs from 'node:fs'
const s = JSON.parse(fs.readFileSync('.tmp/scratch/series.json', 'utf8'))

function wilson(p, n) {
  const z = 1.96, d = 1 + z * z / n
  const c = p + z * z / (2 * n), sp = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - sp) / d, (c + sp) / d]
}

console.log('指標                 | 可比較天數 | CI 不重疊(顯著) | 佔比  | 顯著時 |Δ| 中位')
for (const key of Object.keys(s)) {
  if (key === 'activeUsers') continue
  const a = s[key]['7d']
  let comparable = 0, sig = 0
  const mags = []
  for (let i = 7; i < a.length; i++) {
    const cur = a[i], prev = a[i - 7]
    if (!cur || !prev || cur.v === null || prev.v === null) continue
    if (!cur.n || !prev.n || cur.n < 30 || prev.n < 30) continue
    comparable++
    const c = wilson(cur.v, cur.n), p = wilson(prev.v, prev.n)
    if (c[0] > p[1] || c[1] < p[0]) { sig++; mags.push(Math.abs(cur.v - prev.v)) }
  }
  mags.sort((x, y) => x - y)
  const med = mags.length ? (100 * mags[Math.floor(mags.length / 2)]).toFixed(1) + 'pp' : '—'
  console.log(
    key.padEnd(20), '|', String(comparable).padStart(10), '|', String(sig).padStart(15), '|',
    (comparable ? (100 * sig / comparable).toFixed(0) + '%' : '—').padStart(5), '|', med.padStart(8),
  )
}

// Does the SAB fix show up as significant?
console.log('\n--- SAB 修復期間（05-26 ~ 06-02）的 7d WoW 顯著性 ---')
const a = s.sabUnavailPct['7d']
for (let i = 7; i < a.length && i < 20; i++) {
  const cur = a[i], prev = a[i - 7]
  if (cur.v === null || prev.v === null || !cur.n || !prev.n) continue
  const c = wilson(cur.v, cur.n), p = wilson(prev.v, prev.n)
  const sig = c[0] > p[1] || c[1] < p[0]
  console.log(`${cur.d}  ${(100*prev.v).toFixed(1)}% → ${(100*cur.v).toFixed(1)}%  Δ${(100*(cur.v-prev.v)).toFixed(1)}pp  ${sig ? '★ 顯著' : '  不顯著'}`)
}
