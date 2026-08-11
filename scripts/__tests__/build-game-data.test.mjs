// Smoke test for scripts/build-game-data.mjs `parseCsv` helper.
// Runnable via `node --test` and also discovered by Vitest
// (it treats `test(...)` from 'node:test' similarly).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  parseCsv,
  normalizeWorldsBundle,
  buildRecipes,
  buildLvAdjust,
  checkLvAdjustInvariant,
  collectLevelSyncFailures,
} from '../build-game-data.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')

test('parseCsv: SaintCoinach rawexd format uses header row 1 (names)', () => {
  // Mimic SaintCoinach rawexd shape (the format used by ffxiv-datamining-tw).
  const csv = [
    'key,0,1,2,3',
    '#,Singular,Level{Item},CanBeHq,Icon',
    'int32,str,byte,bool,int32',
    '5057,黑鐵錠,20,True,21204',
    '5106,黑鐵砂,20,False,20405',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'saintcoinach')
  assert.deepEqual(headers, ['#', 'Singular', 'Level{Item}', 'CanBeHq', 'Icon'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['#'], '5057')
  assert.equal(rows[0].Singular, '黑鐵錠')
  assert.equal(rows[0]['Level{Item}'], '20')
  assert.equal(rows[0].CanBeHq, 'True')
  assert.equal(rows[1]['#'], '5106')
  assert.equal(rows[1].Icon, '20405')
})

test('parseCsv: Oxidizer format uses header row 0 directly', () => {
  // Mimic xivapi/ffxiv-datamining csv/en shape.
  const csv = [
    '#,Name,LevelItem,CanBeHq,Icon',
    '5057,Iron Ingot,20,True,21204',
    '5106,Iron Ore,20,False,20405',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'oxidizer')
  assert.deepEqual(headers, ['#', 'Name', 'LevelItem', 'CanBeHq', 'Icon'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Name, 'Iron Ingot')
  assert.equal(rows[1]['#'], '5106')
  assert.equal(rows[0].CanBeHq, 'True')
})

test('parseCsv: skips fully-empty rows', () => {
  const csv = ['#,Name', '1,A', ',', '2,B'].join('\n')
  const { rows } = parseCsv(csv, 'oxidizer')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Name, 'A')
  assert.equal(rows[1].Name, 'B')
})

test('parseCsv: handles quoted commas in values', () => {
  const csv = ['#,Name', '1,"Hello, World"'].join('\n')
  const { rows } = parseCsv(csv, 'oxidizer')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].Name, 'Hello, World')
})

test('normalizeWorldsBundle: mirrors live API shape with worlds and dataCenters', () => {
  const worlds = [
    { id: 34, name: 'Brynhildr' },
    { id: 40, name: 'Zalera' },
    { id: 49, name: 'Adamantoise' },
  ]
  const dcs = [
    { name: 'Primal', region: 'North-America', worlds: [34] },
    { name: 'Aether', region: 'North-America', worlds: [49, 40] },
  ]
  const bundle = normalizeWorldsBundle(worlds, dcs, '2026-04-23T00:00:00.000Z')
  assert.equal(bundle.schemaVersion, 1)
  assert.equal(bundle.fetchedAt, '2026-04-23T00:00:00.000Z')
  // worlds sorted by name
  assert.deepEqual(bundle.worlds, [
    { id: 49, name: 'Adamantoise' },
    { id: 34, name: 'Brynhildr' },
    { id: 40, name: 'Zalera' },
  ])
  // DCs sorted by name within region; worlds remain as ids
  assert.equal(bundle.dataCenters[0].name, 'Aether')
  assert.equal(bundle.dataCenters[1].name, 'Primal')
  assert.deepEqual(bundle.dataCenters[0].worlds, [49, 40])
  assert.deepEqual(bundle.dataCenters[1].worlds, [34])
})

test('normalizeWorldsBundle: drops unknown world ids from DCs silently', () => {
  const worlds = [{ id: 1, name: 'Foo' }]
  const dcs = [{ name: 'Test', region: 'Europe', worlds: [1, 999] }]
  const bundle = normalizeWorldsBundle(worlds, dcs, '2026-01-01T00:00:00.000Z')
  assert.deepEqual(bundle.dataCenters[0].worlds, [1])
})

// ---------------------------------------------------------------------------
// Level-sync recipes (#234)
// ---------------------------------------------------------------------------

test('buildLvAdjust: resolves length-101 table with correct index -> rlv mapping', () => {
  // Sentinels lifted straight from GathererCrafterLvAdjustTable.csv (xivapi).
  const csv = [
    '#,RecipeLevel,Unknown1,CrafterLevel,GathererLevel,FisherLevel',
    '90,560,560,560,560,528',
    '94,660,660,633,633,594',
    '100,690,690,690,690,647',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'oxidizer')
  const lvAdjust = buildLvAdjust(rows, headers, false)
  assert.equal(lvAdjust.length, 101)
  assert.equal(lvAdjust[90], 560)
  assert.equal(lvAdjust[94], 660)
  assert.equal(lvAdjust[100], 690)
  // Untouched indices default to 0.
  assert.equal(lvAdjust[0], 0)
  assert.equal(lvAdjust[50], 0)
})

test('buildLvAdjust: reads RecipeLevel, not Unknown1', () => {
  // At crafter level 61 the two columns diverge (RecipeLevel=255, Unknown1=204)
  // — using Unknown1 would violate the classJobLevel/stars invariant.
  const csv = [
    '#,RecipeLevel,Unknown1,CrafterLevel,GathererLevel,FisherLevel',
    '61,255,204,150,150,153',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'oxidizer')
  const lvAdjust = buildLvAdjust(rows, headers, false)
  assert.equal(lvAdjust[61], 255)
})

test('buildRecipes: reads MaxAdjustableJobLevel; omits key when 0', () => {
  const csv = [
    '#,ItemResult,CraftType,RecipeLevelTable,MaxAdjustableJobLevel',
    '36168,1,0,690,100',
    '99999,2,0,690,0',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'oxidizer')
  const { recipes } = buildRecipes(rows, headers, false)
  const synced = recipes.find((r) => r.id === 36168)
  const notSynced = recipes.find((r) => r.id === 99999)
  assert.equal(synced.maxAdjustableJobLevel, 100)
  assert.equal('maxAdjustableJobLevel' in notSynced, false)
})

test('checkLvAdjustInvariant: passes when every level maps to its own classJobLevel/stars=0 rlv', () => {
  const lvAdjust = new Array(101).fill(0)
  const rltByRlv = new Map()
  for (let level = 1; level <= 100; level++) {
    lvAdjust[level] = level
    rltByRlv.set(level, { classJobLevel: level, stars: 0 })
  }
  assert.deepEqual(checkLvAdjustInvariant(lvAdjust, rltByRlv), [])
})

test('checkLvAdjustInvariant: catches a violation (starred rlt row at the target rlv)', () => {
  const lvAdjust = new Array(101).fill(0)
  const rltByRlv = new Map()
  for (let level = 1; level <= 100; level++) {
    lvAdjust[level] = level
    rltByRlv.set(level, { classJobLevel: level, stars: 0 })
  }
  // Level 61 wrongly resolves to a starred rlv 204 whose classJobLevel is 60.
  lvAdjust[61] = 204
  rltByRlv.set(204, { classJobLevel: 60, stars: 3 })
  const messages = checkLvAdjustInvariant(lvAdjust, rltByRlv)
  assert.ok(messages.length > 0)
  assert.ok(messages.some((m) => m.includes('61')))
})

// ---------------------------------------------------------------------------
// collectLevelSyncFailures (#234 build-time sanity check, previously inline
// in main() with zero coverage)
// ---------------------------------------------------------------------------

function makeCleanLevelSyncFixture() {
  const lvAdjust = new Array(101).fill(0)
  const rltByRlv = new Map()
  for (let level = 1; level <= 100; level++) {
    lvAdjust[level] = level
    rltByRlv.set(level, { classJobLevel: level, stars: 0 })
  }
  const recipes = [{ id: 1, maxAdjustableJobLevel: 100 }]
  return { lvAdjust, recipes, rltByRlv }
}

test('collectLevelSyncFailures: clean fixture returns an empty array', () => {
  const { lvAdjust, recipes, rltByRlv } = makeCleanLevelSyncFixture()
  assert.deepEqual(collectLevelSyncFailures({ lvAdjust, recipes, rltByRlv }), [])
})

test('collectLevelSyncFailures: zero level-synced recipes is non-empty', () => {
  const { lvAdjust, rltByRlv } = makeCleanLevelSyncFixture()
  const recipes = [{ id: 1 }, { id: 2, maxAdjustableJobLevel: 0 }]
  const failures = collectLevelSyncFailures({ lvAdjust, recipes, rltByRlv })
  assert.ok(failures.length > 0)
  assert.ok(failures.some((m) => m.includes('Level-synced recipe count is 0')))
})

test('collectLevelSyncFailures: invariant violation (starred target row) is non-empty', () => {
  const { lvAdjust, recipes, rltByRlv } = makeCleanLevelSyncFixture()
  lvAdjust[61] = 204
  rltByRlv.set(204, { classJobLevel: 60, stars: 3 })
  const failures = collectLevelSyncFailures({ lvAdjust, recipes, rltByRlv })
  assert.ok(failures.length > 0)
  assert.ok(failures.some((m) => m.includes('Level-adjust invariant')))
})

test('collectLevelSyncFailures: non-positive lvAdjust entry is non-empty (replaces the dead lvAdjust.length !== 101 check)', () => {
  const { lvAdjust, recipes, rltByRlv } = makeCleanLevelSyncFixture()
  lvAdjust[50] = 0
  const failures = collectLevelSyncFailures({ lvAdjust, recipes, rltByRlv })
  assert.ok(failures.length > 0)
  assert.ok(failures.some((m) => m.includes('level 50') && m.includes('non-positive')))
})

// ---------------------------------------------------------------------------
// Real-data golden checks (#234) — ADR 0003 states there's no second party to
// check our work against; these fix the build-time invariant against the
// actual shipped public/data files instead of only synthetic fixtures.
// ---------------------------------------------------------------------------

test('real data: public/data/rlt.json satisfies the level-sync invariant for every crafter level 1..100', () => {
  const raw = readFileSync(path.join(REPO_ROOT, 'public', 'data', 'rlt.json'), 'utf8')
  const data = JSON.parse(raw)
  const { lvAdjust, rlt } = data

  assert.equal(lvAdjust.length, 101)

  const rltByRlv = new Map()
  if (Array.isArray(rlt)) {
    for (const entry of rlt) rltByRlv.set(entry.rlv, entry)
  } else {
    for (const [key, value] of Object.entries(rlt)) rltByRlv.set(Number(key), value)
  }

  for (let level = 1; level <= 100; level++) {
    const rlv = lvAdjust[level]
    const entry = rltByRlv.get(rlv)
    assert.ok(entry, `level ${level} -> rlv ${rlv} not found in rlt`)
    assert.equal(entry.classJobLevel, level, `level ${level} -> rlv ${rlv} classJobLevel mismatch`)
    assert.equal(entry.stars, 0, `level ${level} -> rlv ${rlv} stars must be 0`)
  }

  // Sentinels lifted from ADR 0003's real-machine golden pairs.
  assert.equal(lvAdjust[90], 560)
  assert.equal(lvAdjust[94], 660)
  assert.equal(lvAdjust[100], 690)
})

test('real data: public/data/recipes.json has exactly 768 level-synced recipes, including the ADR 0003 golden pair', () => {
  const raw = readFileSync(path.join(REPO_ROOT, 'public', 'data', 'recipes.json'), 'utf8')
  const recipes = JSON.parse(raw)

  const synced = recipes.filter((r) => (r.maxAdjustableJobLevel ?? 0) > 0)
  assert.equal(synced.length, 768)

  const r36168 = recipes.find((r) => r.id === 36168)
  const r36480 = recipes.find((r) => r.id === 36480)
  assert.ok(r36168, 'recipe 36168 (研究用的木材) not found')
  assert.ok(r36480, 'recipe 36480 (統一規格的棉線) not found')
  assert.equal(r36168.maxAdjustableJobLevel, 100)
  assert.equal(r36480.maxAdjustableJobLevel, 100)
})
