// #191 決定 5 · verdict 歷史的三種預算方式，實測體積
import fs from 'node:fs'
const { days } = JSON.parse(fs.readFileSync('.tmp/scratch/verdict-history.json', 'utf8'))
const ids = [...new Set(days.flatMap(d => d.verdicts.map(v => v.id)))]

// 方案 1 · trends.json 只帶 #184 的 8 條 glance 指標（現行決定），28d + 7d + 14d，存 (obs, n)
const GLANCE8 = ['solver.failRate', 'solver.completePct', 'batch.failRate', 'batch.completePct',
  'bom.handoffPct', 'returningPct', 'sabUnavailPct']
const p1 = {}
for (const id of GLANCE8) p1[id] = days.map(d => { const v = d.verdicts.find(x => x.id === id); return v ? [v.obs, v.n] : null })
const s1 = JSON.stringify(p1).length

// 方案 2 · 擴到全部規則（21 個 verdict id），28d 單視窗，存 (obs, n) → 前端現算 verdict 歷史
const p2 = {}
for (const id of ids) p2[id] = days.map(d => { const v = d.verdicts.find(x => x.id === id); return v ? [v.obs, v.n] : null })
const s2 = JSON.stringify(p2).length

// 方案 3 · pipeline 直接預算成 verdict 歷史（只存 fired 位元，RLE）
const p3 = {}
for (const id of ids) {
  const bits = days.map(d => { const v = d.verdicts.find(x => x.id === id); return v ? (v.fired ? 1 : 0) : -1 })
  const rle = []
  for (const b of bits) { if (rle.length && rle[rle.length - 1][0] === b) rle[rle.length - 1][1]++; else rle.push([b, 1]) }
  p3[id] = rle
}
const s3 = JSON.stringify(p3).length

const fmt = n => (n / 1024).toFixed(1) + ' KB'
console.log(`天數 ${days.length}、verdict id ${ids.length} 個`)
console.log(`方案 1 · #184 現行 8 條 glance × (obs,n) × 1 視窗   ${fmt(s1)}   （×3 視窗 ≈ ${fmt(s1 * 3)}）`)
console.log(`方案 2 · 全部 ${ids.length} 條規則 × (obs,n) × 28d      ${fmt(s2)}   ← 前端可現算完整 verdict 歷史`)
console.log(`方案 3 · pipeline 預算 fired 位元（RLE）           ${fmt(s3)}   ← 只能答「亮沒亮」，答不了「當時多少」`)
console.log(`\n一年後（365 天）外推：方案 2 ≈ ${fmt((s2 / days.length) * 365)}、方案 3 ≈ ${fmt((s3 / days.length) * 365)}`)
console.log(`對照：#184 實測 trends.json 一年 ≈ 103 KB`)
