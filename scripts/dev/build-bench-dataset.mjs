#!/usr/bin/env node
// One-shot script to generate dataset-1.json and dataset-2.json fixtures
// for §7.5 fallback shadow-mode benchmarking.
//
// Usage: node scripts/dev/build-bench-dataset.mjs
// Output: scripts/dev/datasets/dataset-1.json and dataset-2.json

import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../public/data')
const OUT_DIR = resolve(__dirname, 'datasets')

const [itemsRaw, recipesRaw, rltRaw] = await Promise.all([
  readFile(resolve(DATA_DIR, 'items/zh-TW.json'), 'utf8'),
  readFile(resolve(DATA_DIR, 'recipes.json'), 'utf8'),
  readFile(resolve(DATA_DIR, 'rlt.json'), 'utf8'),
])

const itemsData = JSON.parse(itemsRaw)
const recipesData = JSON.parse(recipesRaw)
const rltData = JSON.parse(rltRaw)

// Build item lookup: name -> itemId
const itemByName = new Map()
for (const entry of itemsData.items) {
  const [id, name] = entry
  if (!itemByName.has(name)) itemByName.set(name, [])
  itemByName.get(name).push(id)
}

// Build recipe lookup: itemId -> [recipe, ...]
const recipesByItemId = new Map()
for (const r of Object.values(recipesData)) {
  if (!recipesByItemId.has(r.itemResult)) recipesByItemId.set(r.itemResult, [])
  recipesByItemId.get(r.itemResult).push(r)
}

// craftType: 0=CRP, 1=BSM, 2=ARM, 3=GSM, 4=LTW, 5=WVR, 6=ALC, 7=CUL
const CRAFT_TYPE = { CRP: 0, BSM: 1, ARM: 2, GSM: 3, LTW: 4, WVR: 5, ALC: 6, CUL: 7 }

function lookupRecipe(label, craftTypeKey) {
  const itemIds = itemByName.get(label)
  if (!itemIds || itemIds.length === 0) {
    throw new Error(`Item not found: "${label}"`)
  }

  const craftType = craftTypeKey !== undefined ? CRAFT_TYPE[craftTypeKey] : undefined
  let candidates = []
  for (const itemId of itemIds) {
    const recs = recipesByItemId.get(itemId) || []
    for (const r of recs) {
      if (craftType === undefined || r.craftType === craftType) {
        candidates.push(r)
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No recipe found for "${label}" (craftType=${craftTypeKey ?? 'any'})`)
  }
  if (candidates.length > 1) {
    console.warn(`  WARNING: ${candidates.length} recipe candidates for "${label}" (craftType=${craftTypeKey}), picking first (id=${candidates[0].id})`)
  }
  return candidates[0]
}

function computeStats(recipe) {
  const rltEntry = rltData.rlt[String(recipe.rlv)]
  if (!rltEntry) throw new Error(`No rlt entry for rlv=${recipe.rlv} (recipe id=${recipe.id})`)
  return {
    rlvl: recipe.rlv,
    progress: Math.floor(rltEntry.difficulty * recipe.difficultyFactor / 100),
    quality: Math.floor(rltEntry.quality * recipe.qualityFactor / 100),
    durability: Math.floor(rltEntry.durability * recipe.durabilityFactor / 100),
  }
}

function makeRow(label, craftTypeKey, overrideRecipeId) {
  if (overrideRecipeId !== undefined) {
    // Find by id directly (for copy-from-existing-dataset)
    const recipe = Object.values(recipesData).find(r => r.id === overrideRecipeId)
    if (!recipe) throw new Error(`recipeId ${overrideRecipeId} not found`)
    const stats = computeStats(recipe)
    return { label, recipeId: recipe.id, quantity: 1, ...stats,
      craftsmanship: 5000, control: 5000, cp: 600, level: 100, manipulation: true }
  }
  const recipe = lookupRecipe(label, craftTypeKey)
  const stats = computeStats(recipe)
  return { label, recipeId: recipe.id, quantity: 1, ...stats,
    craftsmanship: 5000, control: 5000, cp: 600, level: 100, manipulation: true }
}

// --- Dataset 1: 6 recipes, 軍需品 mix lv94-99 ---
console.log('Building dataset-1...')
const ds1Rows = [
  makeRow('相思木砂輪機', 'CRP'),
  makeRow('鈷鎢禦敵坎肩', 'ARM'),
  makeRow('粉綠柱石詠咒半指手套', 'GSM'),
  makeRow('卡岡圖亞革制敵軟甲褲', 'LTW'),  // note: 制 not 製 (actual item name in data)
  makeRow('薄絹巧匠工作帽', 'WVR'),
  makeRow('鮭魚乾', 'CUL'),
]
for (const r of ds1Rows) {
  console.log(`  ${r.label.padEnd(20)} recipeId=${r.recipeId} rlvl=${r.rlvl} prog=${r.progress} q=${r.quality} dur=${r.durability}`)
}

const dataset1 = { name: 'dataset-1-軍需品-lv94-99', recipes: ds1Rows }
await writeFile(resolve(OUT_DIR, 'dataset-1.json'), JSON.stringify(dataset1, null, 2) + '\n')
console.log('  -> written dataset-1.json\n')

// --- Dataset 2: 7 recipes, mix lv94-100 ---
console.log('Building dataset-2...')
// Note: 卡扎納爾手鋸 is in dataset-3 with recipeId=6118 — copy directly
// Note: 粉綠柱石詠咒半指手套 is same as dataset-1 entry 3
const ds2Rows = [
  makeRow('相思木符杖', undefined),        // CRP or GSM — let script find it, warn if ambiguous
  makeRow('卡扎納爾手鋸', 'BSM', 6118),    // copy from dataset-3
  makeRow('粉綠柱石詠咒半指手套', 'GSM'),  // same as dataset-1 entry 3
  makeRow('卡岡圖亞革禦敵軟甲褲', 'LTW'),  // note 禦敵 vs 製敵 — different from dataset-1
  makeRow('薄絹禦敵腿套', 'WVR'),
  makeRow('智力之寶藥', 'ALC'),
  makeRow('奶油熱巧克力', 'CUL'),
]
for (const r of ds2Rows) {
  console.log(`  ${r.label.padEnd(20)} recipeId=${r.recipeId} rlvl=${r.rlvl} prog=${r.progress} q=${r.quality} dur=${r.durability}`)
}

const dataset2 = { name: 'dataset-2-mixed-lv94-100', recipes: ds2Rows }
await writeFile(resolve(OUT_DIR, 'dataset-2.json'), JSON.stringify(dataset2, null, 2) + '\n')
console.log('  -> written dataset-2.json\n')

// Verify overlapping recipes match dataset-3 ground truth
console.log('Cross-checking overlaps with dataset-3...')
const ds3 = JSON.parse(await readFile(resolve(OUT_DIR, 'dataset-3.json'), 'utf8'))
const ds3Map = new Map(ds3.recipes.map(r => [r.recipeId, r]))

const overlaps = [
  // dataset-1 has no overlaps with dataset-3
  // dataset-2 has 卡扎納爾手鋸 (6118) and 粉綠柱石詠咒半指手套
  ...ds2Rows,
]
let mismatches = 0
for (const row of overlaps) {
  const gt = ds3Map.get(row.recipeId)
  if (!gt) continue
  const fields = ['rlvl', 'progress', 'quality', 'durability']
  for (const f of fields) {
    if (row[f] !== gt[f]) {
      console.error(`  MISMATCH ${row.label} (${row.recipeId}): ${f} generated=${row[f]} dataset3=${gt[f]}`)
      mismatches++
    }
  }
  if (mismatches === 0) {
    console.log(`  OK: ${row.label} (${row.recipeId}) matches dataset-3`)
  }
}
if (mismatches > 0) {
  console.error('OVERLAP MISMATCHES DETECTED — fix the script before committing!')
  process.exit(1)
}
console.log('\nDone.')
