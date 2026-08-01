// #191 決定 4 · 對稱 CI 規則 vs 滉清窗，哪個真的擋得住假熄滅
import fs from 'node:fs'
const DIR = '.tmp/scratch/ga-history'
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
function wilson(obs, n) {
  if (!n) return [0, 1]
  const z = 1.959963985, p = obs / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}
const R = [
  { id: 'batch.failRate', th: .10, dir: 'high', label: '批量失敗率', p: b => [b.glance.batch.fails, b.glance.batch.starts] },
  { id: 'bom.handoffPct', th: .15, dir: 'low', label: 'BOM→批量交棒率', p: b => [b.glance.bom.sentToBatch, b.glance.bom.calculates] },
  { id: 'batch.completePct', th: .85, dir: 'low', label: '批量完成率', p: b => [b.glance.batch.completes, b.glance.batch.starts] },
  { id: 'f1', th: .30, dir: 'low', label: '漏斗 Batch prep→Optimize', p: b => { const f = (b.q4Funnels || []).find(x => x.name.startsWith('Batch')); return f ? [f.to, f.from] : null } },
  { id: 'f2', th: .30, dir: 'low', label: '漏斗 BOM→Consumed', p: b => { const f = (b.q4Funnels || []).find(x => x.name.startsWith('BOM')); return f ? [f.to, f.from] : null } },
  { id: 'm1', th: .10, dir: 'high', label: '誤用·批量頁只放單一配方', p: b => mz(b, 'single_recipe_in_batch') },
  { id: 'm2', th: .03, dir: 'high', label: '誤用·模擬器塞入大量佇列', p: b => mz(b, 'large_queue_in_simulator') },
  { id: 'm3', th: .06, dir: 'high', label: '誤用·BOM 未填數量', p: b => mz(b, 'bom_without_quantity') },
]
function mz(b, t) { const m = (b.misuseSignals || []).find(x => x.type === t); return m ? [m.affectedUsers, b.glance.activeUsers.total] : null }

const days = []
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'))
  if (!s.windows?.['28d']) continue
  const b = s.windows['28d'], st = {}
  for (const r of R) {
    const pr = r.p(b)
    if (!pr || !Number.isFinite(pr[0]) || !pr[1] || pr[1] < 30) { st[r.id] = 'absent'; continue }
    const [lo, hi] = wilson(pr[0], pr[1])
    // fire = CI 完全落在門檻的壞側；clear = CI 完全落在門檻的好側；否則灰帶
    const fire = r.dir === 'low' ? hi < r.th : lo > r.th
    const clear = r.dir === 'low' ? lo > r.th : hi < r.th
    st[r.id] = fire ? 'fire' : clear ? 'clear' : 'grey'
  }
  days.push({ date: f.replace('.json', ''), st, })
}

console.log(`${days.length} 天 · 三種「宣告熄滅」規則的準確度\n`)
const schemes = [
  { name: '① 不亮就算熄滅（N=1）', ok: (s, i) => s[i] !== 'fire' },
  { name: '② 滉清 7 天（不亮持續 7 天）', ok: (s, i) => i >= 6 && s.slice(i - 6, i + 1).every(x => x !== 'fire') },
  { name: '③ 對稱 CI：CI 整段落到門檻好側', ok: (s, i) => s[i] === 'clear' },
  { name: '④ 對稱 CI + 滉清 3 天', ok: (s, i) => i >= 2 && s.slice(i - 2, i + 1).every(x => x === 'clear') },
]
for (const sc of schemes) {
  let declared = 0, wrong = 0, lines = []
  for (const r of R) {
    const s = days.map(d => d.st[r.id])
    let announced = false
    for (let i = 0; i < s.length; i++) {
      if (s[i] === 'fire') { announced = false; continue }
      if (announced) continue
      if (!s.slice(0, i).includes('fire')) continue          // 從沒亮過的不算熄滅
      if (!sc.ok(s, i)) continue
      announced = true; declared++
      const back = s.slice(i + 1).includes('fire')
      if (back) wrong++
      lines.push(`     ${r.label} @${days[i].date}${back ? '  ⚠ 之後又亮 = 假熄滅' : '  ✓ 沒再亮'}`)
    }
  }
  console.log(`${sc.name}：宣告 ${declared} 次，其中假熄滅 ${wrong} 次（${declared ? ((100 * wrong) / declared).toFixed(0) : 0}%）`)
  console.log(lines.join('\n'))
  console.log()
}

console.log('灰帶有多常見（fire / grey / clear 天數分佈）：')
for (const r of R) {
  const s = days.map(d => d.st[r.id])
  const c = k => s.filter(x => x === k).length
  console.log(`  ${r.label.padEnd(24)} fire ${String(c('fire')).padStart(3)}  灰帶 ${String(c('grey')).padStart(3)}  clear ${String(c('clear')).padStart(3)}  absent ${c('absent')}`)
}
