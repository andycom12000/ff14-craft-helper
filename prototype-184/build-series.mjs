import fs from 'node:fs'
const DIR = '.tmp/scratch/ga-history'
const files = fs.readdirSync(DIR).sort()

const M = {
  activeUsers:    b => ({ v: b.glance.activeUsers.total, n: null }),
  returningPct:   b => ({ v: b.glance.activeUsers.returningPct, n: b.glance.activeUsers.total }),
  solverCompletePct: b => ({ v: b.glance.solver.completePct, n: b.glance.solver.starts }),
  solverFailPct:  b => ({ v: b.glance.solver.fails / b.glance.solver.starts, n: b.glance.solver.starts }),
  batchCompletePct: b => ({ v: b.glance.batch.completePct, n: b.glance.batch.starts }),
  batchFailPct:   b => ({ v: b.glance.batch.fails / b.glance.batch.starts, n: b.glance.batch.starts }),
  bomHandoffPct:  b => ({ v: b.glance.bom.handoffPct, n: b.glance.bom.calculates }),
  sabUnavailPct:  b => ({ v: b.glance.infra.sabUnavailable / b.glance.activeUsers.total, n: b.glance.activeUsers.total }),
}

const series = {}
for (const key of Object.keys(M)) series[key] = { '7d': [], '14d': [], '28d': [] }

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'))
  const date = f.replace('.json', '')
  for (const w of ['7d', '14d', '28d']) {
    const b = s.windows?.[w]
    if (!b) continue
    for (const [key, fn] of Object.entries(M)) {
      let r
      try { r = fn(b) } catch { r = { v: null, n: null } }
      const v = Number.isFinite(r.v) ? r.v : null
      series[key][w].push({ d: date, v, n: r.n })
    }
  }
}

// stats per metric on the 28d window
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))] }
console.log('metric               | days | min    | p10    | med    | p90    | max    | last')
for (const [key, w] of Object.entries(series)) {
  const vals = w['28d'].map(r => r.v).filter(v => v !== null)
  const fmt = v => key === 'activeUsers' ? String(Math.round(v)).padStart(6) : (100 * v).toFixed(1).padStart(5) + '%'
  console.log(
    key.padEnd(20), '|', String(vals.length).padStart(4), '|',
    fmt(Math.min(...vals)), '|', fmt(q(vals, 0.1)), '|', fmt(q(vals, 0.5)), '|',
    fmt(q(vals, 0.9)), '|', fmt(Math.max(...vals)), '|', fmt(vals[vals.length - 1]),
  )
}

fs.writeFileSync('.tmp/scratch/series.json', JSON.stringify(series))
const size = fs.statSync('.tmp/scratch/series.json').size
console.log(`\nseries.json = ${(size / 1024).toFixed(1)} KB (8 metrics × 3 windows × 71 days, minified)`)
console.log(`vs 71 raw snapshots = ${(6.1 * 1024).toFixed(0)} KB`)
