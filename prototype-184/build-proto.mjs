// PROTOTYPE BUILDER — wayfinder #184. Throwaway. Emits .tmp/scratch/baseline-proto.html
import fs from 'node:fs'

const s = JSON.parse(fs.readFileSync('.tmp/scratch/series.json', 'utf8'))
const dates = s.activeUsers['28d'].map(r => r.d)

// Metric metadata mirrors the threshold table decided in #181 / #183.
const META = [
  { key: 'batchFailPct',      label: '批量失敗率',    cls: 'A', dir: 'high', th: 0.10, pct: true,  trusted: true,  actionable: true  },
  { key: 'solverFailPct',     label: 'Solver 失敗率', cls: 'A', dir: 'high', th: 0.02, pct: true,  trusted: false, actionable: true  },
  { key: 'batchCompletePct',  label: '批量完成率',    cls: 'B', dir: 'low',  th: 0.85, pct: true,  trusted: true,  actionable: true  },
  { key: 'bomHandoffPct',     label: 'BOM→批量交棒率', cls: 'B', dir: 'low', th: 0.15, pct: true,  trusted: true,  actionable: true  },
  { key: 'solverCompletePct', label: 'Solver 完成率', cls: 'B', dir: 'low',  th: 0.95, pct: true,  trusted: false, actionable: true  },
  { key: 'returningPct',      label: '回訪率',        cls: '—', dir: 'low',  th: null, pct: true,  trusted: true,  actionable: false },
  { key: 'sabUnavailPct',     label: 'SAB 不可用率',  cls: '—', dir: 'high', th: null, pct: true,  trusted: true,  actionable: false },
  { key: 'activeUsers',       label: '活躍用戶',      cls: '—', dir: 'low',  th: null, pct: false, trusted: true,  actionable: false },
]

const payload = { dates, meta: META, series: {} }
for (const m of META) {
  payload.series[m.key] = {}
  for (const w of ['7d', '14d', '28d']) {
    payload.series[m.key][w] = s[m.key][w].map(r => ({
      d: r.d,
      v: r.v === null ? null : Number(r.v.toFixed(5)),
      n: r.n,
    }))
  }
}

const html = fs.readFileSync('.tmp/scratch/proto-template.html', 'utf8')
  .replace('/*__DATA__*/', JSON.stringify(payload))
fs.writeFileSync('.tmp/scratch/baseline-proto.html', html)
console.log('wrote .tmp/scratch/baseline-proto.html', (fs.statSync('.tmp/scratch/baseline-proto.html').size / 1024).toFixed(1) + ' KB')
