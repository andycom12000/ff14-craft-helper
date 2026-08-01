// #191 決定 4 · 滉清窗 N 該訂多少、熄滅條目該留多久
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
    if (!pr || !Number.isFinite(pr[0]) || !pr[1] || pr[1] < 30) { st[r.id] = { state: 'absent' }; continue }
    const [lo, hi] = wilson(pr[0], pr[1])
    st[r.id] = { state: (r.dir === 'low' ? hi < r.th : lo > r.th) ? 'fire' : 'quiet', val: pr[0] / pr[1] }
  }
  days.push({ date: f.replace('.json', ''), st })
}

console.log(`${days.length} 天 · 滉清窗 N 對「宣告熄滅」的過濾效果\n`)
console.log(' N  宣告熄滅次數  其中之後又亮（假熄滅）  存活的真熄滅')
for (const N of [1, 2, 3, 5, 7, 10, 14]) {
  let declared = 0, falseAlarm = 0, detail = []
  for (const r of R) {
    const s = days.map(d => d.st[r.id].state)
    for (let i = N; i < s.length; i++) {
      // 第 i 天宣告：i-N..i-1 全 quiet，且 i-N-1 是 fire（剛好滿 N 天）
      if (s[i - N - 1] !== 'fire') continue
      if (s.slice(i - N, i).every(x => x === 'quiet')) {
        declared++
        const back = s.slice(i).some(x => x === 'fire')
        if (back) falseAlarm++
        detail.push(`${r.label} @${days[i].date}${back ? ' ⚠又亮' : ''}`)
      }
    }
  }
  console.log(` ${String(N).padStart(2)} ${String(declared).padStart(11)} ${String(falseAlarm).padStart(20)} ${String(declared - falseAlarm).padStart(13)}   ${N === 7 ? detail.join(' / ') : ''}`)
}

console.log('\n熄滅條目留多久 → 熄滅區塊的長度（滉清窗 N=7）')
for (const KEEP of [7, 14, 28, Infinity]) {
  const lens = days.map((d, i) => {
    let c = 0
    for (const r of R) {
      const s = days.map(x => x.st[r.id].state)
      // 找最後一次 fire
      let lastFire = -1
      for (let j = i; j >= 0; j--) if (s[j] === 'fire') { lastFire = j; break }
      if (lastFire < 0 || lastFire === i) continue
      const darkFor = i - lastFire
      if (darkFor >= 7 && darkFor - 7 < KEEP) c++
    }
    return c
  })
  const max = Math.max(...lens), med = [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 2)]
  console.log(`  宣告後保留 ${KEEP === Infinity ? '永久' : KEEP + ' 天'}：熄滅區塊長度 中位 ${med} 條、最長 ${max} 條、今天 ${lens[lens.length - 1]} 條`)
}
