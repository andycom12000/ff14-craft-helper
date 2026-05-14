# 部隊工坊 Workshop Project Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開「部隊工坊」頁面追蹤 FFXIV 潛水艇 / 飛空艇 / 工坊建材的素材繳交進度，剩餘素材一鍵推進 BOM 採購流程（單向 Tracker → BOM 同步）。

**Architecture:** 4 張新 CSV（CompanyCraftSequence/Part/Process/Type）進 `build-game-data.mjs` 產出 `public/data/company-craft.json`，**只存 phases**，總量與剩餘量都在 client 動態算。新 `workshop-projects` Pinia store 持久化專案 + per-supplyItem progress 到 localStorage。BomTarget 加 `kind: 'company-craft-project'` discriminated union，BOM 反應式讀 project 計算的剩餘素材。新頁 `/company-craft` 以 Editorial Hero + project cards + phase board 三層結構呈現，建立專案走 3-step `el-dialog`。

**Tech Stack:** Vue 3 + Pinia + pinia-plugin-persistedstate + Element Plus + TypeScript + Vitest + Node test runner（build script）。Spec: `docs/superpowers/specs/2026-05-13-company-craft-picker-design.md`。

---

## ⚠ Plan Corrections (Rev 2 · post-simplify review)

**Read this section first.** It overrides specific code blocks in the body tasks. Listed by task; apply at task time.

### C1 · Drop `quantity` field from `WorkshopProjectSequence` (correctness — affects Tasks 4, 5, 7, 12, 17, 18)

Original plan let a project's sequence list carry `{ sequenceId, quantity }`. With per-`phaseKey` delivery counters that lack a copy index, `quantity > 1` makes `getRemainingMaterials` and `getProjectProgress` disagree (one scales by qty, the other shares a single counter). Cleanest fix: **always 1 per ref**. If a player wants 3 walls, they create 3 projects.

- In Task 4, change `WorkshopProjectSequence` to: `interface WorkshopProjectSequence { sequenceId: number }`
- In Task 5, drop every `* ref.quantity` multiplier and the `donePhases += ref.quantity` line — use `+= 1`
- In Task 12, drop `partsCount`/`partsLabel` usage of quantity (already 1 each)
- In Task 17, `selectedSequences.value.map(s => ({ sequenceId: s.id }))` — no quantity
- In Task 18, same

### C2 · Reuse `CRAFT_TYPE_TO_JOB` instead of new `JOB_NAME_TO_ABBR` (Task 1, 2)

`src/utils/jobs.ts` already exports `CRAFT_TYPE_TO_JOB: { 0: 'CRP', ..., 7: 'CUL' }` keyed by CraftType row id. The CompanyCraftType sheet's `#` column reuses the same DoH ordering. Replace the build script's `JOB_NAME_TO_ABBR` lookup with:

```js
import { CRAFT_TYPE_TO_JOB } from './craft-types.mjs' // or inline the table
// (build script can't import .ts; either:
//   a) duplicate the table verbatim with a "keep in sync with src/utils/jobs.ts CRAFT_TYPE_TO_JOB" comment, OR
//   b) extract to a shared .mjs)
// In typeMeta loop:
const meta = { jobAbbr: CRAFT_TYPE_TO_JOB[id], level: 0 }
```

The existing comment at `src/utils/jobs.ts:47` already says "keep in sync with scripts/build-game-data.mjs CRAFT_TYPE_TO_JOB" — extend that convention. Do **not** match by English `Name` column (fragile against localization).

### C3 · Keep `bom-calculator.ts` pure — don't import Pinia store (Task 7)

Original plan imports `useWorkshopProjectsStore` inside `bom-calculator.ts`. Services should stay store-free. Change `buildMaterialTree` signature to accept a context:

```ts
export interface BuildMaterialTreeContext {
  /** Resolve a CompanyCraft project's remaining materials. Required when
   *  any target has kind === 'company-craft-project'. */
  resolveProjectRemaining?: (projectId: string) => Map<number, number> | null
}

export async function buildMaterialTree(
  targets: BomTarget[],
  maxDepth: number = DEFAULT_RECURSION_DEPTH,
  ctx: BuildMaterialTreeContext = {},
): Promise<MaterialNode[]>
```

In the `company-craft-project` branch:
```ts
if (target.kind === 'company-craft-project') {
  const remaining = ctx.resolveProjectRemaining?.(target.projectId) ?? null
  if (!remaining) return fallbackLeaf(target)
  // ... expand from `remaining` as before
}
```

In `BomView.handleCalculate` (Task 8 region), inject:
```ts
const tree = await buildMaterialTree(bomStore.targets, undefined, {
  resolveProjectRemaining: (id) => {
    const proj = workshopStore.getProject(id)
    if (!proj) return null
    return getRemainingMaterials(proj, sequences.value)
  },
})
```

This keeps bom-calculator tests pure (no `setActivePinia` setup) and keeps `loadCompanyCraft` import out of the service.

### C4 · Drop `MaterialNode.workshopProjectId` (Task 7)

The field added in Task 7's MaterialNode extension is unused after C3 — the project linkage already lives on the BomTarget (`kind: 'company-craft-project'`, `projectId`). UI consumers that need to render "this is a project root" should branch on the *target* via `bomStore.targets.find(...)`, not on a leak in `MaterialNode`. **Remove the field entirely**; remove the `workshopProjectId: target.projectId,` line from the returned `MaterialNode` literal.

### C5 · Use `<ItemName>` component, never `useItemName(...).value` in templates (Task 14, 25)

`useItemName` is a composable — calling it inside a `v-for` template binding creates a new computed per render and registers fresh watchers. `src/components/common/ItemName.vue` already wraps this correctly. In `PhaseRow.vue`:

```vue
<script setup>
import ItemName from '@/components/common/ItemName.vue'
// drop: import { useItemName } from '@/composables/useItemName'
</script>

<template>
  <span class="supply-name">
    <ItemName :item-id="supply.itemId" />
  </span>
</template>
```

Task 25's a11y addition still applies — but pass the resolved string via a slot prop OR add an `aria-label-prefix` prop to ItemName if needed (simpler: drop the per-supply aria-label entirely; the counter's own aria-label is sufficient since the input is inside the `<label>` wrapper).

### C6 · Add `progressVersion` counter to store; use in reactive sync (Task 4, 8, 22)

Replace Task 8's heavyweight `JSON.stringify(p.phaseProgress)` signature with a per-store version counter:

In `src/stores/workshop-projects.ts` (Task 4):
```ts
const progressVersion = ref(0)

function setDelivered(projectId, phaseKey, supplyIndex, value) {
  const proj = getProject(projectId)
  if (!proj) return
  const clamped = Math.max(0, Math.floor(value))
  const current = proj.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
  if (current === clamped) return  // ← no-op guard
  const row = proj.phaseProgress[phaseKey] ?? {}
  proj.phaseProgress = {
    ...proj.phaseProgress,
    [phaseKey]: { ...row, [supplyIndex]: clamped },
  }
  progressVersion.value++
}

return { /* ..., */ progressVersion }
```

In `BomView.vue` (Task 8), replace `linkedProjectSig`:
```ts
const linkedProjectSig = computed(() => {
  const ids = bomStore.targets
    .filter(t => t.kind === 'company-craft-project')
    .map(t => t.projectId)
  return `${ids.join(',')}::${workshopStore.progressVersion}`
})
```

In Task 22's project-completion watcher, replace the `deep: true` watch with a watch on `[() => workshopStore.progressVersion]`. Inside the handler, iterate `workshopStore.projects` checking `getProjectProgress(p, sequences.value) >= 1` once per progress tick.

### C7 · Debounce the BOM reactive sync (Task 8)

User-driven counter increments could fire `handleCalculate` 12× while clicking `+` 12×. Debounce 300ms:

```ts
let recalcTimer: ReturnType<typeof setTimeout> | null = null
watch(linkedProjectSig, () => {
  if (!calculated.value || bomStore.targets.length === 0) return
  if (recalcTimer) clearTimeout(recalcTimer)
  recalcTimer = setTimeout(() => {
    void handleCalculate()
    ElMessage({ type: 'info', message: '素材清單已更新', duration: 2000 })
  }, 300)
})
```

### C8 · Drop dead migration call (Task 6 Step 5)

The `bom` store does NOT use `persist:`, so `targets.value.length > 0` is always false at store init. **Delete Step 5 entirely.** Keep `migrateLegacyTarget` exported for future use + tests, but don't call it at runtime. If a future PR adds `persist:` to the bom store, the migration call goes in then.

### C9 · Replace `SupplyItemCounter` with `el-input-number` (Task 14)

`el-input-number` already provides `−`/`+`/typed input with `:min`/`:max` clamping, and is styled globally in `src/App.vue:599+`. The hand-rolled component duplicates ~80 lines. Replace `SupplyItemCounter.vue` body with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'

const props = defineProps<{
  projectId: string
  phaseKey: string
  supplyIndex: number
  max: number
}>()

const store = useWorkshopProjectsStore()
const value = computed({
  get: () => store.getDelivered(props.projectId, props.phaseKey, props.supplyIndex),
  set: (v: number) => store.setDelivered(props.projectId, props.phaseKey, props.supplyIndex, v),
})
</script>

<template>
  <span class="counter">
    <el-input-number v-model="value" :min="0" :max="max" size="small" controls-position="right" />
    <span class="max">/ {{ max }}</span>
  </span>
</template>

<style scoped>
.counter { display: inline-flex; align-items: center; gap: 6px; font-family: 'Fira Code', monospace; }
.max { color: var(--app-text-muted); font-size: 12px; }
</style>
```

### C10 · Build `seqById` once per view (Task 12)

`ProjectCard.vue` calls `getProjectProgress` / `getRemainingMaterials` per re-render, each rebuilding `seqById` from props. For N cards × every keystroke this is wasted work. Build once in `CompanyCraftView.vue`:

```ts
const seqById = computed(() => new Map(sequences.value.map(s => [s.id, s])))
// pass :sequences and :seqById both, OR change selectors to accept seqById?
```

Simplest: change selectors in Task 5 to accept `seqById?: Map<number, CompanyCraftSequence>` and rebuild only if absent. Pass from view through `ProjectCard` props.

### C11 · Extract category/slot label maps (Tasks 12, 13, 16, 17)

`{ submersible: 潛水艇, airship: 飛空艇, workshop: 工坊建材 }` and `{ bow: 船首, ..., bridge: 船底 }` appear in 4+ task code blocks. Create `src/utils/company-craft-labels.ts`:

```ts
import type { CompanyCraftCategory, PartSlot } from '@/services/local-data-source.types'

export const CATEGORY_META: Record<CompanyCraftCategory, { icon: string; label: string; hint: string }> = {
  submersible: { icon: '🛰', label: '潛水艇', hint: '4 零件' },
  airship: { icon: '✈', label: '飛空艇', hint: '4 零件' },
  workshop: { icon: '🛠', label: '工坊建材', hint: '單件' },
}

export const SLOT_LABEL: Record<PartSlot, string> = {
  bow: '船首', stern: '船尾', hull: '船身', bridge: '船底',
}
```

Import from this file in all 4 affected components.

### C12 · Derive `dataReady` from `sequences.value.length` (Task 11, 21)

`dataReady.value` is true iff `sequences.value.length > 0`. Drop the separate ref:

```ts
const dataReady = computed(() => sequences.value.length > 0)
// onMounted just calls loadCompanyCraft + assigns sequences.value
```

Removes one assignment in `retryLoad` too.

### C13 · Share test fixtures between bom-calculator + workshop-projects tests (Tasks 5, 7)

The `SEQ_A` / `SEQ_B` fixtures appear in 2 test files. Extract to `src/__tests__/fixtures/company-craft.ts`:

```ts
import type { CompanyCraftSequence } from '@/services/local-data-source.types'

export const SEQ_TATANORA_BOW: CompanyCraftSequence = {
  id: 1, resultItemId: 18715, category: 'submersible', partSlot: 'bow',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
      supplyItems: [
        { itemId: 5057, amount: 12 },
        { itemId: 5058, amount: 6 },
      ] },
    { partIndex: 0, processIndex: 1, jobAbbr: 'GSM', level: 75,
      supplyItems: [{ itemId: 5057, amount: 4 }] },
  ],
}

export const SEQ_TATANORA_STERN: CompanyCraftSequence = {
  id: 2, resultItemId: 18716, category: 'submersible', partSlot: 'stern',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'CRP', level: 70,
      supplyItems: [{ itemId: 5057, amount: 3 }] },
  ],
}
```

Import in both test files. Reduces ~40 lines of duplication.

### C14 · Drop redundant template wrappers + parts-strip (Tasks 11, 13)

- Task 11: `<div class="cc-empty-wrap">` wraps `<ProjectEmptyState>` with no CSS — drop the wrapper.
- Task 13: `parts-strip` listing all parts at the top of the phase board duplicates the per-`part-group` headers that already show the same names. Drop the strip; each `part-group-head` already announces the slot + name.

### C15 · Stop calling `parsePhaseKey` if unused

`parsePhaseKey` is exported in Task 4 but never consumed in the plan. Either delete it or use it in tests (parse-and-roundtrip in `workshop-projects.test.ts` is fine). Don't ship dead exports.

---

## File Structure

**Create:**
- `public/data/company-craft.json` — build artifact (gitignored if symlinked, but typically committed in this repo)
- `src/stores/workshop-projects.ts` — Pinia store: projects + phase progress
- `src/views/CompanyCraftView.vue` — top-level workshop project tracker page
- `src/components/company-craft/ProjectCard.vue` — collapsed project card (icon + progress + actions)
- `src/components/company-craft/PhaseBoard.vue` — expanded project: per-part group, phase rows, counters
- `src/components/company-craft/PhaseRow.vue` — single phase: status icon + job badge + supplyItems
- `src/components/company-craft/SupplyItemCounter.vue` — `−` count `+` widget with direct edit
- `src/components/company-craft/NewProjectDialog.vue` — 3-step modal shell
- `src/components/company-craft/ProjectEmptyState.vue` — first-run CTA
- `src/__tests__/stores/workshop-projects.test.ts`
- `src/__tests__/services/local-data-source-company-craft.test.ts`
- `src/__tests__/components/company-craft/PhaseBoard.test.ts`
- `src/__tests__/components/company-craft/NewProjectDialog.test.ts`
- `scripts/__tests__/build-game-data-company-craft.test.mjs`

**Modify:**
- `scripts/build-game-data.mjs` — add 4 CSV reads + `buildCompanyCraft()` + output writer
- `src/services/local-data-source.ts` — add `loadCompanyCraft`, `getCompanyCraftSequence`, `listCompanyCraftByCategory`
- `src/services/local-data-source.types.ts` — add `CompanyCraftSequence`, `CompanyCraftPhase`, `CompanyCraftCategory` types
- `src/stores/bom.ts` — `BomTarget` discriminated union, migration helper, `kind: 'company-craft-project'` branch in computed dependencies
- `src/services/bom-calculator.ts` — `buildMaterialTree` branch for company-craft-project target
- `src/views/BomView.vue` — `handleSendToBatch` filter `t.kind === 'recipe'`
- `src/router/index.ts` — add `/company-craft` route
- `src/App.vue` — add sidebar menu item + PAGE_ACCENTS mapping
- `src/utils/jobs.ts` — only if missing job→Chinese map for new contexts (most likely already there)
- `src/views/ChangelogView.vue` — add new version entry
- `src/__tests__/stores/bom.test.ts` — BomTarget migration + new target kind tests
- `src/__tests__/services/bom-calculator.test.ts` — company-craft-project expansion

---

## Phase A · Data Layer

### Task 1: Build script — parse CompanyCraft CSVs

**Files:**
- Modify: `scripts/build-game-data.mjs`
- Test: `scripts/__tests__/build-game-data-company-craft.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/build-game-data-company-craft.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCompanyCraft } from '../build-game-data.mjs'

// Minimal fixture: 1 sequence with 1 part holding 1 process that needs 2 items.
const SEQUENCE_CSV = [
  '#,ResultItem,CompanyCraftPart[0],CompanyCraftPart[1]',
  '1,18715,10,0',
].join('\n')

const PART_CSV = [
  '#,CompanyCraftType,CompanyCraftProcess[0],CompanyCraftProcess[1]',
  '10,5,100,0',
].join('\n')

const PROCESS_CSV = [
  '#,SupplyItem[0],SetQuantity[0],SetsRequired[0],SupplyItem[1],SetQuantity[1],SetsRequired[1]',
  '100,5057,3,4,5058,2,3',
].join('\n')

const TYPE_CSV = [
  '#,Name',
  '5,Leatherworker',
].join('\n')

// Item lookup used to detect category via UI category — simplified for test.
const itemUICategoryMap = new Map([[18715, 'Submersible Components']])

test('buildCompanyCraft: builds sequence with phases summed from process supplies', () => {
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    typeCsv: TYPE_CSV,
    itemUICategoryMap,
  })
  assert.equal(result.sequences.length, 1)
  const seq = result.sequences[0]
  assert.equal(seq.id, 1)
  assert.equal(seq.resultItemId, 18715)
  assert.equal(seq.category, 'submersible')
  assert.equal(seq.phases.length, 1)
  const phase = seq.phases[0]
  assert.equal(phase.jobAbbr, 'LTW')
  assert.deepEqual(phase.supplyItems, [
    { itemId: 5057, amount: 12 },   // 3 * 4
    { itemId: 5058, amount: 6 },    // 2 * 3
  ])
})

test('buildCompanyCraft: skips empty Part/Process slots (id 0)', () => {
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    typeCsv: TYPE_CSV,
    itemUICategoryMap,
  })
  // CompanyCraftPart[1]=0 in sequence; CompanyCraftProcess[1]=0 in part —
  // both must be ignored, leaving exactly 1 phase.
  assert.equal(result.sequences[0].phases.length, 1)
})

test('buildCompanyCraft: assigns workshop category for unmapped items', () => {
  const unmapped = new Map()
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    typeCsv: TYPE_CSV,
    itemUICategoryMap: unmapped,
  })
  assert.equal(result.sequences[0].category, 'workshop')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/__tests__/build-game-data-company-craft.test.mjs`
Expected: FAIL — `buildCompanyCraft is not exported`.

- [ ] **Step 3: Implement `buildCompanyCraft` in build script**

Append to `scripts/build-game-data.mjs` (above the closing of file, before `main`):

```js
const JOB_NAME_TO_ABBR = {
  Carpenter: 'CRP',
  Blacksmith: 'BSM',
  Armorer: 'ARM',
  Goldsmith: 'GSM',
  Leatherworker: 'LTW',
  Weaver: 'WVR',
  Alchemist: 'ALC',
  Culinarian: 'CUL',
}

// Map ItemUICategory → CompanyCraft category. Add new mappings as patches drop.
const ITEM_UI_CATEGORY_TO_COMPANY_CRAFT_CATEGORY = {
  'Submersible Components': 'submersible',
  'Airship Components': 'airship',
}

function inferPartSlot(resultItemName) {
  const m = /(Bow|Stern|Hull|Bridge)\s*$/i.exec(resultItemName ?? '')
  if (!m) return null
  return m[1].toLowerCase()
}

/**
 * Build CompanyCraft index from 4 CSV bodies.
 *
 * @param {object} input
 * @param {string} input.sequenceCsv  CompanyCraftSequence.csv content (oxidizer)
 * @param {string} input.partCsv      CompanyCraftPart.csv content (oxidizer)
 * @param {string} input.processCsv   CompanyCraftProcess.csv content (oxidizer)
 * @param {string} input.typeCsv      CompanyCraftType.csv content (oxidizer)
 * @param {Map<number,string>} input.itemUICategoryMap  itemId → ItemUICategory name
 * @param {Map<number,string>} [input.itemNameMap]      itemId → en name (for partSlot inference)
 */
export function buildCompanyCraft({
  sequenceCsv,
  partCsv,
  processCsv,
  typeCsv,
  itemUICategoryMap,
  itemNameMap = new Map(),
}) {
  const { headers: seqHeaders, rows: seqRows } = parseCsv(sequenceCsv, 'oxidizer')
  const { headers: partHeaders, rows: partRows } = parseCsv(partCsv, 'oxidizer')
  const { headers: procHeaders, rows: procRows } = parseCsv(processCsv, 'oxidizer')
  const { rows: typeRows } = parseCsv(typeCsv, 'oxidizer')

  const partById = new Map()
  for (const row of partRows) partById.set(toInt(row['#']), row)
  const processById = new Map()
  for (const row of procRows) processById.set(toInt(row['#']), row)
  const typeJobAbbr = new Map()
  for (const row of typeRows) {
    const id = toInt(row['#'])
    const abbr = JOB_NAME_TO_ABBR[row.Name] ?? null
    if (abbr) typeJobAbbr.set(id, abbr)
  }

  // Discover column groups
  const seqPartCols = []
  for (let i = 0; i < 8; i++) {
    const col = pickHeader(seqHeaders, [`CompanyCraftPart[${i}]`])
    if (col) seqPartCols.push({ index: i, col })
  }
  const partTypeCol = pickHeader(partHeaders, ['CompanyCraftType']) ?? 'CompanyCraftType'
  const partProcessCols = []
  for (let i = 0; i < 8; i++) {
    const col = pickHeader(partHeaders, [`CompanyCraftProcess[${i}]`])
    if (col) partProcessCols.push({ index: i, col })
  }
  const procSupplyCols = []
  for (let i = 0; i < 12; i++) {
    const item = pickHeader(procHeaders, [`SupplyItem[${i}]`])
    const qty = pickHeader(procHeaders, [`SetQuantity[${i}]`])
    const sets = pickHeader(procHeaders, [`SetsRequired[${i}]`])
    if (item && qty && sets) procSupplyCols.push({ item, qty, sets })
  }

  const sequences = []
  for (const seqRow of seqRows) {
    const id = toInt(seqRow['#'])
    const resultItemId = toInt(seqRow.ResultItem)
    if (!resultItemId) continue

    const uiCategory = itemUICategoryMap.get(resultItemId)
    const category = ITEM_UI_CATEGORY_TO_COMPANY_CRAFT_CATEGORY[uiCategory] ?? 'workshop'
    const partSlot = inferPartSlot(itemNameMap.get(resultItemId))

    const phases = []
    for (const { index: partIndex, col } of seqPartCols) {
      const partId = toInt(seqRow[col])
      if (!partId) continue
      const partRow = partById.get(partId)
      if (!partRow) continue
      const typeId = toInt(partRow[partTypeCol])
      const jobAbbr = typeJobAbbr.get(typeId)
      if (!jobAbbr) continue

      for (const { index: processIndex, col: pcol } of partProcessCols) {
        const procId = toInt(partRow[pcol])
        if (!procId) continue
        const procRow = processById.get(procId)
        if (!procRow) continue

        const supplyItems = []
        for (const { item, qty, sets } of procSupplyCols) {
          const itemId = toInt(procRow[item])
          const q = toInt(procRow[qty])
          const s = toInt(procRow[sets])
          if (!itemId || q <= 0 || s <= 0) continue
          supplyItems.push({ itemId, amount: q * s })
        }
        if (supplyItems.length === 0) continue

        phases.push({
          partIndex,
          processIndex,
          jobAbbr,
          level: 0, // Level lookup happens via downstream RLT join if needed; placeholder for now.
          supplyItems,
        })
      }
    }

    if (phases.length === 0) continue
    sequences.push({ id, resultItemId, category, partSlot, phases })
  }

  return { schemaVersion: 1, sequences }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/__tests__/build-game-data-company-craft.test.mjs`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-game-data.mjs scripts/__tests__/build-game-data-company-craft.test.mjs
git commit -m "feat(build): parse CompanyCraft CSVs to phase index"
```

---

### Task 2: Build script — wire CompanyCraft into pipeline output

**Files:**
- Modify: `scripts/build-game-data.mjs`

- [ ] **Step 1: Add level lookup from CompanyCraftType (some sheets expose it)**

In `buildCompanyCraft`, change the typeRows loop to also capture level. Replace:

```js
const typeJobAbbr = new Map()
for (const row of typeRows) {
  const id = toInt(row['#'])
  const abbr = JOB_NAME_TO_ABBR[row.Name] ?? null
  if (abbr) typeJobAbbr.set(id, abbr)
}
```

with:

```js
const typeMeta = new Map()
for (const row of typeRows) {
  const id = toInt(row['#'])
  const abbr = JOB_NAME_TO_ABBR[row.Name] ?? null
  // CompanyCraftType has no level column directly; fallback to ClassJobLevel
  // or any "Level" column the dataminer exposes.
  const levelCol = pickHeader(Object.keys(row), [
    'ClassJobLevel',
    'Level{ClassJob}',
    'Level',
  ])
  const level = levelCol ? toInt(row[levelCol]) : 0
  if (abbr) typeMeta.set(id, { jobAbbr: abbr, level })
}
```

Then in the phase build, replace `const jobAbbr = typeJobAbbr.get(typeId)` with:

```js
const meta = typeMeta.get(typeId)
if (!meta) continue
const { jobAbbr, level } = meta
```

And replace `level: 0,` with `level,`.

- [ ] **Step 2: Wire CompanyCraft into main() pipeline**

In `scripts/build-game-data.mjs`, inside `main()` after the existing `buildItems(...)` block (around line 530), add:

```js
  // Build CompanyCraft index. Source CSVs live alongside Recipe.csv in csv/en.
  const ccSeqPath = path.join(xivDir, 'csv', 'en', 'CompanyCraftSequence.csv')
  const ccPartPath = path.join(xivDir, 'csv', 'en', 'CompanyCraftPart.csv')
  const ccProcPath = path.join(xivDir, 'csv', 'en', 'CompanyCraftProcess.csv')
  const ccTypePath = path.join(xivDir, 'csv', 'en', 'CompanyCraftType.csv')
  const itemUICategoryPath = path.join(xivDir, 'csv', 'en', 'Item.csv')

  let companyCraft = { schemaVersion: 1, sequences: [] }
  try {
    const [sequenceCsv, partCsv, processCsv, typeCsv, itemCsv] = await Promise.all([
      readCsv(ccSeqPath),
      readCsv(ccPartPath),
      readCsv(ccProcPath),
      readCsv(ccTypePath),
      readCsv(itemUICategoryPath),
    ])
    const { headers: itemHeaders, rows: itemRows } = parseCsv(itemCsv, 'oxidizer')
    const uiCatCol = pickHeader(itemHeaders, ['ItemUICategory'])
    const nameCol = pickHeader(itemHeaders, ['Name'])
    const itemUICategoryMap = new Map()
    const itemNameMap = new Map()
    if (uiCatCol) {
      for (const row of itemRows) {
        const id = toInt(row['#'])
        if (!id) continue
        if (uiCatCol && row[uiCatCol]) itemUICategoryMap.set(id, row[uiCatCol])
        if (nameCol && row[nameCol]) itemNameMap.set(id, row[nameCol])
      }
    }
    companyCraft = buildCompanyCraft({
      sequenceCsv, partCsv, processCsv, typeCsv,
      itemUICategoryMap, itemNameMap,
    })
    log(verbose, `  CompanyCraft sequences: ${companyCraft.sequences.length}`)
  } catch (err) {
    console.warn(`[warn] CompanyCraft build skipped: ${err.message}`)
  }
```

- [ ] **Step 3: Add sanity check and write output**

In the `failures` block (around line 532), add:

```js
  if (companyCraft.sequences.length === 0) {
    console.warn('[warn] CompanyCraft index is empty; downstream features will show empty state')
  }
```

In the `Writing to tmp` section (around line 600), add:

```js
  await fs.writeFile(
    path.join(OUT_TMP, 'company-craft.json'),
    JSON.stringify(companyCraft),
  )
```

In the atomic-swap `copies` array, add:

```js
    ['company-craft.json', 'company-craft.json'],
```

In the final report (around line 685), add:

```js
  const ccSize = (await fs.stat(path.join(OUT_FINAL, 'company-craft.json'))).size
  console.log(`  company-craft.json: ${(ccSize / 1024).toFixed(1)} KB`)
```

- [ ] **Step 4: Build the data once locally to verify**

Run: `npm run build-game-data`
Expected:
- Output `Build complete:` with new line `company-craft.json: NN.N KB`
- File `public/data/company-craft.json` exists, non-empty
- No new failures in sanity checks

- [ ] **Step 5: Commit**

```bash
git add scripts/build-game-data.mjs public/data/company-craft.json
git commit -m "feat(build): emit public/data/company-craft.json"
```

---

### Task 3: Local data source — types & loader

**Files:**
- Modify: `src/services/local-data-source.types.ts`
- Modify: `src/services/local-data-source.ts`
- Test: `src/__tests__/services/local-data-source-company-craft.test.ts`

- [ ] **Step 1: Add types**

Append to `src/services/local-data-source.types.ts`:

```ts
export type CompanyCraftCategory = 'submersible' | 'airship' | 'workshop'
export type PartSlot = 'bow' | 'stern' | 'hull' | 'bridge'

export interface CompanyCraftPhase {
  partIndex: number
  processIndex: number
  jobAbbr: string
  level: number
  supplyItems: Array<{ itemId: number; amount: number }>
}

export interface CompanyCraftSequence {
  id: number
  resultItemId: number
  category: CompanyCraftCategory
  partSlot: PartSlot | null
  phases: CompanyCraftPhase[]
}

export interface CompanyCraftFile {
  schemaVersion: 1
  sequences: CompanyCraftSequence[]
}
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/services/local-data-source-company-craft.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadCompanyCraft,
  getCompanyCraftSequence,
  listCompanyCraftByCategory,
} from '@/services/local-data-source'

const FIXTURE = {
  schemaVersion: 1 as const,
  sequences: [
    {
      id: 1, resultItemId: 18715, category: 'submersible' as const,
      partSlot: 'bow' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
          supplyItems: [{ itemId: 5057, amount: 12 }] },
      ],
    },
    {
      id: 2, resultItemId: 18716, category: 'submersible' as const,
      partSlot: 'stern' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'GSM', level: 75,
          supplyItems: [{ itemId: 5058, amount: 6 }] },
      ],
    },
    {
      id: 99, resultItemId: 20000, category: 'workshop' as const,
      partSlot: null,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'CRP', level: 60,
          supplyItems: [{ itemId: 5057, amount: 4 }] },
      ],
    },
  ],
}

describe('company-craft loader', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/data/company-craft.json')) {
        return new Response(JSON.stringify(FIXTURE), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    // reset module cache so each test re-fetches
    vi.resetModules()
  })

  it('loadCompanyCraft returns the parsed sequences', async () => {
    const seqs = await loadCompanyCraft()
    expect(seqs).toHaveLength(3)
    expect(seqs[0].resultItemId).toBe(18715)
  })

  it('getCompanyCraftSequence returns by id after load', async () => {
    await loadCompanyCraft()
    expect(getCompanyCraftSequence(2)?.partSlot).toBe('stern')
    expect(getCompanyCraftSequence(404)).toBeNull()
  })

  it('listCompanyCraftByCategory filters by category', async () => {
    await loadCompanyCraft()
    const subs = listCompanyCraftByCategory('submersible')
    expect(subs.map(s => s.id).sort()).toEqual([1, 2])
    const workshop = listCompanyCraftByCategory('workshop')
    expect(workshop).toHaveLength(1)
  })

  it('listCompanyCraftByCategory filters by partSlot too', async () => {
    await loadCompanyCraft()
    const bows = listCompanyCraftByCategory('submersible', 'bow')
    expect(bows).toHaveLength(1)
    expect(bows[0].id).toBe(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- local-data-source-company-craft`
Expected: FAIL — exports missing.

- [ ] **Step 4: Implement loader and queries**

Add to `src/services/local-data-source.ts` after the existing `loadRecipes` block (around line 140):

```ts
let companyCraftPromise: Promise<CompanyCraftSequence[]> | null = null
const companyCraftById = new Map<number, CompanyCraftSequence>()
const companyCraftByCategory = new Map<string, CompanyCraftSequence[]>()

export async function loadCompanyCraft(): Promise<CompanyCraftSequence[]> {
  if (companyCraftPromise) return companyCraftPromise
  companyCraftPromise = (async () => {
    try {
      const data = await fetchJson<CompanyCraftFile>(dataUrl('/data/company-craft.json'))
      if (data.schemaVersion !== 1) {
        throw new Error(`company-craft.json: unsupported schemaVersion ${(data as { schemaVersion?: number }).schemaVersion}`)
      }
      companyCraftById.clear()
      companyCraftByCategory.clear()
      for (const seq of data.sequences) {
        companyCraftById.set(seq.id, seq)
        const list = companyCraftByCategory.get(seq.category) ?? []
        list.push(seq)
        companyCraftByCategory.set(seq.category, list)
      }
      return data.sequences
    } catch (err) {
      companyCraftPromise = null
      throw err
    }
  })()
  return companyCraftPromise
}

export function getCompanyCraftSequence(id: number): CompanyCraftSequence | null {
  return companyCraftById.get(id) ?? null
}

export function listCompanyCraftByCategory(
  category: CompanyCraftCategory,
  partSlot?: PartSlot,
): CompanyCraftSequence[] {
  const all = companyCraftByCategory.get(category) ?? []
  if (!partSlot) return all
  return all.filter(s => s.partSlot === partSlot)
}
```

Also add the imports at the top of `local-data-source.ts`:

```ts
import type {
  // ... existing imports
  CompanyCraftSequence,
  CompanyCraftFile,
  CompanyCraftCategory,
  PartSlot,
} from './local-data-source.types'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- local-data-source-company-craft`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/local-data-source.ts src/services/local-data-source.types.ts src/__tests__/services/local-data-source-company-craft.test.ts
git commit -m "feat(data): expose CompanyCraft loader + category/slot queries"
```

---

## Phase B · Project state model

### Task 4: workshop-projects store — interfaces + CRUD

**Files:**
- Create: `src/stores/workshop-projects.ts`
- Test: `src/__tests__/stores/workshop-projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/stores/workshop-projects.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
} from '@/stores/workshop-projects'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('workshop-projects CRUD', () => {
  it('creates a project with given sequences', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'Tatanora 號',
      category: 'submersible',
      sequences: [
        { sequenceId: 1, quantity: 1 },
        { sequenceId: 2, quantity: 1 },
      ],
    })
    expect(id).toBeTruthy()
    const proj = store.getProject(id)
    expect(proj?.name).toBe('Tatanora 號')
    expect(proj?.sequences).toHaveLength(2)
    expect(proj?.phaseProgress).toEqual({})
    expect(proj?.completedAt).toBeUndefined()
  })

  it('deletes a project by id', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 99, quantity: 1 }],
    })
    store.deleteProject(id)
    expect(store.getProject(id)).toBeNull()
  })

  it('updates phaseProgress immutably and exposes via getDelivered', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, key, 0, 5)
    expect(store.getDelivered(id, key, 0)).toBe(5)
    store.setDelivered(id, key, 0, 12)
    expect(store.getDelivered(id, key, 0)).toBe(12)
  })

  it('clamps setDelivered to non-negative', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, key, 0, -5)
    expect(store.getDelivered(id, key, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- workshop-projects`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal store**

Create `src/stores/workshop-projects.ts`:

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CompanyCraftCategory } from '@/services/local-data-source.types'

export interface PhaseProgressKey {
  sequenceId: number
  partIndex: number
  processIndex: number
}

export interface WorkshopProjectSequence {
  sequenceId: number
  quantity: number
}

export interface WorkshopProject {
  id: string
  name: string
  category: CompanyCraftCategory
  createdAt: number
  completedAt?: number
  sequences: WorkshopProjectSequence[]
  /** key = serializePhaseKey(...); inner key = supplyItem index; value = delivered count */
  phaseProgress: Record<string, Record<number, number>>
}

export function serializePhaseKey(k: PhaseProgressKey): string {
  return `${k.sequenceId}:${k.partIndex}:${k.processIndex}`
}

export function parsePhaseKey(s: string): PhaseProgressKey {
  const [seq, part, proc] = s.split(':').map(Number)
  return { sequenceId: seq, partIndex: part, processIndex: proc }
}

function genId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useWorkshopProjectsStore = defineStore('workshop-projects', () => {
  const projects = ref<WorkshopProject[]>([])

  function getProject(id: string): WorkshopProject | null {
    return projects.value.find(p => p.id === id) ?? null
  }

  function createProject(input: {
    name: string
    category: CompanyCraftCategory
    sequences: WorkshopProjectSequence[]
  }): string {
    const id = genId()
    projects.value.push({
      id,
      name: input.name,
      category: input.category,
      createdAt: Date.now(),
      sequences: [...input.sequences],
      phaseProgress: {},
    })
    return id
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter(p => p.id !== id)
  }

  function renameProject(id: string, name: string) {
    const proj = getProject(id)
    if (proj) proj.name = name
  }

  function getDelivered(projectId: string, phaseKey: string, supplyIndex: number): number {
    const proj = getProject(projectId)
    if (!proj) return 0
    return proj.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
  }

  function setDelivered(projectId: string, phaseKey: string, supplyIndex: number, value: number) {
    const proj = getProject(projectId)
    if (!proj) return
    const clamped = Math.max(0, Math.floor(value))
    const row = proj.phaseProgress[phaseKey] ?? {}
    proj.phaseProgress = {
      ...proj.phaseProgress,
      [phaseKey]: { ...row, [supplyIndex]: clamped },
    }
  }

  function markCompleted(id: string) {
    const proj = getProject(id)
    if (proj) proj.completedAt = Date.now()
  }

  function unmarkCompleted(id: string) {
    const proj = getProject(id)
    if (proj) delete proj.completedAt
  }

  const projectCount = computed(() => projects.value.length)
  const activeProjects = computed(() => projects.value.filter(p => !p.completedAt))

  return {
    projects,
    projectCount,
    activeProjects,
    getProject,
    createProject,
    deleteProject,
    renameProject,
    getDelivered,
    setDelivered,
    markCompleted,
    unmarkCompleted,
  }
}, {
  persist: {
    pick: ['projects'],
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- workshop-projects`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/workshop-projects.ts src/__tests__/stores/workshop-projects.test.ts
git commit -m "feat(stores): workshop-projects CRUD + phase counters"
```

---

### Task 5: workshop-projects — selectors for aggregation

**Files:**
- Modify: `src/stores/workshop-projects.ts`
- Test: `src/__tests__/stores/workshop-projects.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/stores/workshop-projects.test.ts`:

```ts
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import {
  getProjectProgress,
  getRemainingMaterials,
  getTotalMaterials,
  isPhaseComplete,
} from '@/stores/workshop-projects'

const SEQ_A: CompanyCraftSequence = {
  id: 1, resultItemId: 18715, category: 'submersible', partSlot: 'bow',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
      supplyItems: [
        { itemId: 5057, amount: 12 },
        { itemId: 5058, amount: 6 },
      ] },
    { partIndex: 0, processIndex: 1, jobAbbr: 'GSM', level: 75,
      supplyItems: [{ itemId: 5057, amount: 4 }] },
  ],
}

const SEQ_B: CompanyCraftSequence = {
  id: 2, resultItemId: 18716, category: 'submersible', partSlot: 'stern',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'CRP', level: 70,
      supplyItems: [{ itemId: 5057, amount: 3 }] },
  ],
}

function makeProject(store: ReturnType<typeof useWorkshopProjectsStore>) {
  return store.createProject({
    name: 'X', category: 'submersible',
    sequences: [{ sequenceId: 1, quantity: 1 }, { sequenceId: 2, quantity: 2 }],
  })
}

describe('workshop-projects selectors', () => {
  it('getTotalMaterials sums quantity × supplyItem amount across sequences', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const total = getTotalMaterials(store.getProject(id)!, [SEQ_A, SEQ_B])
    // SEQ_A: 5057 ×(12+4)=16, 5058 ×6
    // SEQ_B: 5057 ×3, quantity 2 → 5057 +6
    expect(total.get(5057)).toBe(16 + 6)
    expect(total.get(5058)).toBe(6)
  })

  it('getRemainingMaterials subtracts delivered counts', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const proj = store.getProject(id)!
    const keyA1 = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, keyA1, 0, 12) // 5057 in phase A1 fully delivered (12)
    store.setDelivered(id, keyA1, 1, 4)  // 5058 partially delivered (4 of 6)
    const remaining = getRemainingMaterials(proj, [SEQ_A, SEQ_B])
    // 5057 total 22, delivered 12, remaining 10
    expect(remaining.get(5057)).toBe(10)
    // 5058 total 6, delivered 4, remaining 2
    expect(remaining.get(5058)).toBe(2)
  })

  it('isPhaseComplete returns true when every supplyItem is at amount', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    expect(isPhaseComplete(store.getProject(id)!, SEQ_A.phases[0], key)).toBe(false)
    store.setDelivered(id, key, 0, 12)
    store.setDelivered(id, key, 1, 6)
    expect(isPhaseComplete(store.getProject(id)!, SEQ_A.phases[0], key)).toBe(true)
  })

  it('getProjectProgress is fraction of completed phases over total phases × quantity', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    // Total phases: SEQ_A has 2 phases × 1, SEQ_B has 1 phase × 2 = 4
    expect(getProjectProgress(store.getProject(id)!, [SEQ_A, SEQ_B])).toBe(0)
    const keyA1 = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, keyA1, 0, 12)
    store.setDelivered(id, keyA1, 1, 6)
    // 1 of 4 phase-units complete = 0.25
    expect(getProjectProgress(store.getProject(id)!, [SEQ_A, SEQ_B])).toBeCloseTo(0.25)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- workshop-projects`
Expected: FAIL — selectors missing.

- [ ] **Step 3: Implement selectors**

Append to `src/stores/workshop-projects.ts` (above `useWorkshopProjectsStore`):

```ts
import type { CompanyCraftSequence, CompanyCraftPhase } from '@/services/local-data-source.types'

export function getDelivered(
  project: WorkshopProject,
  phaseKey: string,
  supplyIndex: number,
): number {
  return project.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
}

export function isPhaseComplete(
  project: WorkshopProject,
  phase: CompanyCraftPhase,
  phaseKey: string,
): boolean {
  for (let i = 0; i < phase.supplyItems.length; i++) {
    if (getDelivered(project, phaseKey, i) < phase.supplyItems[i].amount) {
      return false
    }
  }
  return true
}

export function getTotalMaterials(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
): Map<number, number> {
  const out = new Map<number, number>()
  const seqById = new Map(sequences.map(s => [s.id, s]))
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      for (const supply of phase.supplyItems) {
        const prev = out.get(supply.itemId) ?? 0
        out.set(supply.itemId, prev + supply.amount * ref.quantity)
      }
    }
  }
  return out
}

export function getRemainingMaterials(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
): Map<number, number> {
  const out = new Map<number, number>()
  const seqById = new Map(sequences.map(s => [s.id, s]))
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      const phaseKey = serializePhaseKey({
        sequenceId: ref.sequenceId,
        partIndex: phase.partIndex,
        processIndex: phase.processIndex,
      })
      for (let i = 0; i < phase.supplyItems.length; i++) {
        const supply = phase.supplyItems[i]
        const delivered = getDelivered(project, phaseKey, i)
        const remaining = Math.max(0, supply.amount - delivered) * ref.quantity
        if (remaining <= 0) continue
        const prev = out.get(supply.itemId) ?? 0
        out.set(supply.itemId, prev + remaining)
      }
    }
  }
  return out
}

export function getProjectProgress(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
): number {
  const seqById = new Map(sequences.map(s => [s.id, s]))
  let totalPhases = 0
  let donePhases = 0
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      const phaseKey = serializePhaseKey({
        sequenceId: ref.sequenceId,
        partIndex: phase.partIndex,
        processIndex: phase.processIndex,
      })
      totalPhases += ref.quantity
      if (isPhaseComplete(project, phase, phaseKey)) donePhases += ref.quantity
    }
  }
  return totalPhases === 0 ? 0 : donePhases / totalPhases
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- workshop-projects`
Expected: all tests pass (4 CRUD + 4 selector).

- [ ] **Step 5: Commit**

```bash
git add src/stores/workshop-projects.ts src/__tests__/stores/workshop-projects.test.ts
git commit -m "feat(stores): workshop-projects aggregation selectors"
```

---

## Phase C · BOM Integration

### Task 6: BomTarget discriminated union + migration

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/stores/bom.test.ts`:

```ts
import { migrateLegacyTarget, useBomStore } from '@/stores/bom'

describe('BomTarget migration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('upgrades legacy target without kind (with recipeId)', () => {
    const legacy = { itemId: 100, recipeId: 5, name: 'X', icon: '', quantity: 1 }
    const upgraded = migrateLegacyTarget(legacy)
    expect(upgraded).toMatchObject({ kind: 'recipe', recipeId: 5, itemId: 100 })
  })

  it('upgrades legacy target without kind (recipeId null) to no-recipe', () => {
    const legacy = { itemId: 100, recipeId: null, name: 'X', icon: '', quantity: 1 }
    const upgraded = migrateLegacyTarget(legacy)
    expect(upgraded).toMatchObject({ kind: 'no-recipe', itemId: 100 })
  })

  it('passes through already-migrated targets', () => {
    const next = { kind: 'recipe' as const, recipeId: 5, itemId: 100, name: '', icon: '', quantity: 1 }
    expect(migrateLegacyTarget(next)).toBe(next)
  })

  it('addTarget accepts company-craft-project kind', () => {
    const bom = useBomStore()
    bom.addTarget({
      kind: 'company-craft-project',
      projectId: 'proj-abc',
      itemId: -1,
      name: 'Tatanora 號',
      icon: '',
      quantity: 1,
    })
    expect(bom.targets[0]).toMatchObject({ kind: 'company-craft-project', projectId: 'proj-abc' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom.test`
Expected: FAIL — `migrateLegacyTarget` undefined and BomTarget union missing.

- [ ] **Step 3: Update types**

In `src/stores/bom.ts`, replace the `BomTarget` interface with:

```ts
interface BaseBomTarget {
  itemId: number
  /** @deprecated — use useItemName(itemId) */
  name: string
  icon: string
  quantity: number
}

export interface RecipeBomTarget extends BaseBomTarget {
  kind: 'recipe'
  recipeId: number
  amountResult?: number
}

export interface CompanyCraftProjectBomTarget extends BaseBomTarget {
  kind: 'company-craft-project'
  projectId: string
}

export interface NoRecipeBomTarget extends BaseBomTarget {
  kind: 'no-recipe'
}

export type BomTarget =
  | RecipeBomTarget
  | CompanyCraftProjectBomTarget
  | NoRecipeBomTarget

export function migrateLegacyTarget(t: unknown): BomTarget {
  const obj = t as Record<string, unknown>
  if (obj && typeof obj === 'object' && 'kind' in obj) return obj as BomTarget
  const itemId = Number(obj.itemId)
  const name = String(obj.name ?? '')
  const icon = String(obj.icon ?? '')
  const quantity = Number(obj.quantity ?? 1)
  const recipeId = obj.recipeId
  const base: BaseBomTarget = { itemId, name, icon, quantity }
  if (recipeId == null) return { ...base, kind: 'no-recipe' }
  return {
    ...base,
    kind: 'recipe',
    recipeId: Number(recipeId),
    amountResult: obj.amountResult !== undefined ? Number(obj.amountResult) : undefined,
  }
}
```

- [ ] **Step 4: Update `addTarget` to dedupe across kinds**

Replace the `addTarget` function in `src/stores/bom.ts` with:

```ts
function addTarget(target: BomTarget) {
  // company-craft-project: dedupe by projectId, not itemId (synthetic itemId)
  if (target.kind === 'company-craft-project') {
    const existing = targets.value.find(
      t => t.kind === 'company-craft-project' && t.projectId === target.projectId,
    )
    if (existing) return
    targets.value.push(target)
    return
  }
  // recipe / no-recipe: dedupe by itemId
  const existing = targets.value.find(t => t.itemId === target.itemId)
  if (existing) {
    existing.quantity += target.quantity
  } else {
    targets.value.push(target)
  }
}
```

- [ ] **Step 5: Apply migration on store init**

In `useBomStore` (right after the `const targets = ref<BomTarget[]>([])` line), add a synchronous one-shot migration over any pre-existing state:

```ts
// Migrate any pre-existing serialized targets (from older app versions / dev sessions).
// pinia-plugin-persistedstate isn't in use for the bom store yet, so this is a
// no-op in production — kept defensive for forward-compat / tests injecting state.
if (targets.value.length > 0) {
  targets.value = targets.value.map(migrateLegacyTarget)
}
```

- [ ] **Step 6: Fix type errors in existing call sites**

Find all callers that constructed a `BomTarget` literal and add `kind`. The known sites:
- `src/views/BomView.vue:147–156` (`handleAddFromSearch`): wrap as `kind: 'recipe', recipeId: recipe.id, ...`
- `src/components/bom/BomImportDialog.vue` (search for `addTarget`): apply same `kind: 'recipe'` / `kind: 'no-recipe'`
- Any test fixture under `src/__tests__/stores/bom.test.ts` building literals

In `BomView.vue:147–156`, replace `handleAddFromSearch` with:

```ts
function handleAddFromSearch(recipe: import('@/stores/recipe').Recipe) {
  bomStore.addTarget({
    kind: 'recipe',
    itemId: recipe.itemId,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    quantity: 1,
    amountResult: recipe.amountResult,
  })
  ElMessage.success(`已加入「${recipe.name}」`)
}
```

In `BomImportDialog.vue` find the dialog's "commit" handler (around the `bom.addTarget(...)` call) and add the appropriate `kind` literal based on whether the entry resolved a recipe.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- bom.test`
Expected: migration tests pass; existing tests still pass.

- [ ] **Step 8: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/stores/bom.ts src/views/BomView.vue src/components/bom/BomImportDialog.vue src/__tests__/stores/bom.test.ts
git commit -m "refactor(bom): BomTarget discriminated union + legacy migration"
```

---

### Task 7: bom-calculator — company-craft-project branch

**Files:**
- Modify: `src/services/bom-calculator.ts`
- Test: `src/__tests__/services/bom-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/services/bom-calculator.test.ts`:

```ts
import { setActivePinia, createPinia } from 'pinia'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import { buildMaterialTree } from '@/services/bom-calculator'
import { vi } from 'vitest'

vi.mock('@/services/local-data-source', async () => {
  const actual = await vi.importActual<typeof import('@/services/local-data-source')>(
    '@/services/local-data-source',
  )
  return {
    ...actual,
    loadCompanyCraft: vi.fn(async () => [{
      id: 1, resultItemId: 18715, category: 'submersible' as const, partSlot: 'bow' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
          supplyItems: [{ itemId: 5057, amount: 12 }] },
      ],
    }]),
    getCompanyCraftSequence: vi.fn((id: number) => id === 1 ? {
      id: 1, resultItemId: 18715, category: 'submersible' as const, partSlot: 'bow' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
          supplyItems: [{ itemId: 5057, amount: 12 }] },
      ],
    } : null),
  }
})

describe('buildMaterialTree with company-craft-project target', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('expands a project target into per-supply children using remaining materials', async () => {
    const ws = useWorkshopProjectsStore()
    const projectId = ws.createProject({
      name: 'Tatanora 號',
      category: 'submersible',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })

    const tree = await buildMaterialTree([{
      kind: 'company-craft-project',
      projectId,
      itemId: -1,
      name: 'Tatanora 號',
      icon: '',
      quantity: 1,
    }])

    expect(tree).toHaveLength(1)
    const root = tree[0]
    expect(root.workshopProjectId).toBe(projectId)
    expect(root.children?.length).toBe(1)
    expect(root.children?.[0].itemId).toBe(5057)
    expect(root.children?.[0].amount).toBe(12)
  })

  it('shrinks expansion as phase deliveries are recorded', async () => {
    const ws = useWorkshopProjectsStore()
    const projectId = ws.createProject({
      name: 'X', category: 'submersible',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })
    // mark 4 of 12 delivered
    ws.setDelivered(projectId, '1:0:0', 0, 4)

    const tree = await buildMaterialTree([{
      kind: 'company-craft-project',
      projectId,
      itemId: -1, name: 'X', icon: '', quantity: 1,
    }])
    expect(tree[0].children?.[0].amount).toBe(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom-calculator`
Expected: FAIL — `buildMaterialTree` doesn't handle `kind: 'company-craft-project'` and `MaterialNode.workshopProjectId` doesn't exist.

- [ ] **Step 3: Extend `MaterialNode` type**

In `src/stores/bom.ts`, in the `MaterialNode` interface, add the optional field:

```ts
export interface MaterialNode {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId?: number
  /** Marks this node as the root of a CompanyCraft project expansion. */
  workshopProjectId?: string
  children?: MaterialNode[]
  collapsed?: boolean
}
```

- [ ] **Step 4: Add branch in `buildMaterialTree`**

In `src/services/bom-calculator.ts`, find the `buildMaterialTree` function. Before the existing `if (target.recipeId === null)` block, add:

```ts
import { useWorkshopProjectsStore, getRemainingMaterials } from '@/stores/workshop-projects'
import { loadCompanyCraft } from '@/services/local-data-source'

// inside buildMaterialTree, when iterating targets:
if (target.kind === 'company-craft-project') {
  const ws = useWorkshopProjectsStore()
  const project = ws.getProject(target.projectId)
  if (!project) {
    return {
      itemId: target.itemId,
      name: target.name,
      icon: target.icon,
      amount: target.quantity,
      workshopProjectId: target.projectId,
    } as MaterialNode
  }
  const sequences = await loadCompanyCraft()
  const remaining = getRemainingMaterials(project, sequences)
  const ancestorIds = new Set<number>()
  const children = await Promise.all(
    [...remaining.entries()].map(([itemId, amount]) =>
      expandNode(itemId, '', '', amount, 1, maxDepth, ancestorIds),
    ),
  )
  return {
    itemId: target.itemId,
    name: target.name,
    icon: target.icon,
    amount: target.quantity,
    workshopProjectId: target.projectId,
    children,
  } as MaterialNode
}
```

Note: the existing function signature handles `BomTarget` from `bom.ts`; with the discriminated union we must update the `if (target.recipeId === null)` check below to use `if (target.kind === 'no-recipe')` to satisfy type narrowing.

Refactor the `targets.map` body accordingly:

```ts
const results = await Promise.allSettled(
  targets.map(async (target) => {
    if (target.kind === 'company-craft-project') {
      // ... (above branch)
    }
    if (target.kind === 'no-recipe') {
      return {
        itemId: target.itemId, name: target.name, icon: target.icon,
        amount: target.quantity,
      } as MaterialNode
    }
    // target.kind === 'recipe'
    const recipe = await fetchRecipeCached(target.recipeId)
    // ... existing logic
  }),
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- bom-calculator`
Expected: new tests + existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/bom-calculator.ts src/stores/bom.ts src/__tests__/services/bom-calculator.test.ts
git commit -m "feat(bom): expand company-craft-project targets via remaining materials"
```

---

### Task 8: Reactive sync project → BOM

**Files:**
- Modify: `src/views/BomView.vue`

- [ ] **Step 1: Add a watcher on relevant project state**

In `src/views/BomView.vue` `<script setup>` section, add after the existing store imports:

```ts
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'

const workshopStore = useWorkshopProjectsStore()

// When any company-craft-project target exists and its underlying project
// changes phase progress, recompute the material tree for that target.
// Lightweight implementation: watch a signature of "for each linked project,
// concat its phaseProgress JSON" — recompute when it changes.
const linkedProjectSig = computed(() => {
  const sigs: string[] = []
  for (const t of bomStore.targets) {
    if (t.kind !== 'company-craft-project') continue
    const p = workshopStore.getProject(t.projectId)
    if (!p) continue
    sigs.push(`${t.projectId}:${JSON.stringify(p.phaseProgress)}`)
  }
  return sigs.join('|')
})

watch(linkedProjectSig, async () => {
  if (!calculated.value) return
  if (bomStore.targets.length === 0) return
  // Re-run the calc with the updated remaining-material numbers.
  await handleCalculate()
  ElMessage({
    type: 'info',
    message: '素材清單已更新',
    duration: 2000,
  })
})
```

- [ ] **Step 2: Verify manually**

Add a transient log inside the watcher and confirm by running `npm run dev`, manually creating a project (next phases will add the UI), wiring it to BOM, then mutating phase progress in devtools.

(In the absence of UI yet, this watcher is dormant — no automated test runs because the round-trip relies on the UI components built in phases D-E. Smoke test added in Task 22.)

- [ ] **Step 3: Commit**

```bash
git add src/views/BomView.vue
git commit -m "feat(bom): re-aggregate project-linked targets when phase progress changes"
```

---

### Task 9: handleSendToBatch filter — exclude non-recipe kinds

**Files:**
- Modify: `src/views/BomView.vue`

- [ ] **Step 1: Replace filter**

In `src/views/BomView.vue`, find `handleSendToBatch` (around line 164). Replace:

```ts
const craftableTargets = bomStore.targets.filter(
  (t): t is typeof t & { recipeId: number } => t.recipeId !== null,
)
```

with:

```ts
const craftableTargets = bomStore.targets.filter(
  (t): t is import('@/stores/bom').RecipeBomTarget => t.kind === 'recipe',
)
```

And inside the for loop, replace `craftableTargets[i].recipeId` with `craftableTargets[i].recipeId` (no change — the narrowed type guarantees it).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/views/BomView.vue
git commit -m "refactor(bom): handleSendToBatch filters by kind === 'recipe'"
```

---

## Phase D · 部隊工坊 main view

### Task 10: Route + sidebar entry

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Add route**

In `src/router/index.ts`, after the `/bom` route block, add:

```ts
{
  path: '/company-craft',
  name: 'companyCraft',
  component: () => import('@/views/CompanyCraftView.vue'),
  meta: { title: '部隊工坊' },
},
```

- [ ] **Step 2: Stub `CompanyCraftView.vue` so the route resolves**

Create `src/views/CompanyCraftView.vue`:

```vue
<script setup lang="ts">
// Placeholder — filled in Task 11.
</script>
<template>
  <div class="company-craft-view">
    <h2>部隊工坊</h2>
  </div>
</template>
<style scoped>
.company-craft-view { padding: 24px 32px; }
</style>
```

- [ ] **Step 3: Add sidebar menu item + accent**

In `src/App.vue`, add `Ship` (or `Tools`) icon to the imports — check `@element-plus/icons-vue` exports for an appropriate symbol; `Tools` exists and works as a workshop metaphor. Modify the imports block:

```ts
import {
  Setting, Cpu, List, TrendCharts, Suitcase, Operation, Close,
  Document, AlarmClock, HomeFilled, Tools,
} from '@element-plus/icons-vue'
```

Add to `PAGE_ACCENTS`:

```ts
'/company-craft': { color: 'var(--app-craft)', dim: 'var(--app-craft-dim)' },
```

Add the menu item right after the `/bom` `<el-menu-item>` block:

```html
<el-menu-item index="/company-craft">
  <el-icon><Tools /></el-icon>
  <span>部隊工坊</span>
  <span class="menu-badge menu-badge--beta">實驗中</span>
</el-menu-item>
```

- [ ] **Step 4: Run the dev server and verify navigation**

Run: `npm run dev` and open `http://localhost:5173/#/company-craft`
Expected: page renders the placeholder H1; sidebar entry highlights.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/App.vue src/views/CompanyCraftView.vue
git commit -m "feat(workshop): scaffold /company-craft route + sidebar entry"
```

---

### Task 11: Editorial Hero + empty state

**Files:**
- Modify: `src/views/CompanyCraftView.vue`
- Create: `src/components/company-craft/ProjectEmptyState.vue`

- [ ] **Step 1: Implement the empty state component**

Create `src/components/company-craft/ProjectEmptyState.vue`:

```vue
<script setup lang="ts">
defineEmits<{ 'open-new': [] }>()
</script>

<template>
  <div class="empty">
    <h4>還沒有開工的專案</h4>
    <p>建立一個專案來追蹤潛水艇、飛空艇或工坊建材的素材進度。</p>
    <el-button type="primary" size="large" @click="$emit('open-new')">
      +&nbsp;&nbsp;新增專案
    </el-button>
  </div>
</template>

<style scoped>
.empty {
  border: 1px dashed var(--app-border);
  border-radius: 14px;
  padding: 56px 32px;
  text-align: center;
  background: var(--app-surface);
}
.empty h4 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 18px;
  color: var(--app-text-muted);
  margin: 0 0 6px;
}
.empty p {
  font-size: 13px;
  color: var(--app-text-muted);
  max-width: 30ch;
  margin: 0 auto 22px;
}
</style>
```

- [ ] **Step 2: Implement view shell with hero**

Replace `src/views/CompanyCraftView.vue` contents:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import { loadCompanyCraft, loadingState } from '@/services/local-data-source'
import { useLocaleStore } from '@/stores/locale'
import ProjectEmptyState from '@/components/company-craft/ProjectEmptyState.vue'

const workshopStore = useWorkshopProjectsStore()
const localeStore = useLocaleStore()
const newDialogOpen = ref(false)
const dataReady = ref(false)

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return !dataReady.value || s.items
})

const activeProjects = computed(() => workshopStore.activeProjects)

onMounted(async () => {
  await loadCompanyCraft()
  dataReady.value = true
})
</script>

<template>
  <div class="company-craft-view" v-loading="isLoadingData">
    <header class="cc-header">
      <span class="cc-eyebrow">工坊圖紙 · BLUEPRINTS</span>
      <h2>部隊工坊 <span class="cc-beta" aria-label="實驗中">實驗中</span></h2>
      <p class="cc-tagline">『今天工坊裡，動到哪一步了？』</p>
      <div class="cc-chalk-rule" />
    </header>

    <div v-if="activeProjects.length === 0" class="cc-empty-wrap">
      <ProjectEmptyState @open-new="newDialogOpen = true" />
    </div>

    <div v-else class="cc-projects">
      <div class="cc-toolbar">
        <el-button type="primary" @click="newDialogOpen = true">+&nbsp;&nbsp;新增專案</el-button>
        <span class="cc-counter">{{ activeProjects.length }} 個進行中</span>
      </div>
      <!-- Project cards added in Task 12 -->
    </div>

    <!-- NewProjectDialog added in Task 18-22 -->
  </div>
</template>

<style scoped>
.company-craft-view {
  padding: 28px 32px 120px;
  max-width: 1200px;
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
}

.cc-header {
  margin-bottom: 32px;
}

.cc-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--app-accent-glow);
  color: var(--app-accent);
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 14px;
}

.cc-header h2 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 40px);
  line-height: 1.1;
  margin: 0 0 8px;
}

.cc-beta {
  display: inline-flex;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-gold, oklch(0.78 0.14 78)) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-gold, oklch(0.78 0.14 78)) 50%, transparent);
  color: var(--accent-gold, oklch(0.78 0.14 78));
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  line-height: 1;
  vertical-align: middle;
}

.cc-tagline {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-weight: 500;
  font-size: clamp(18px, 2.5vw, 24px);
  line-height: 1.2;
  color: var(--app-craft);
  margin: 4px 0 16px;
}

.cc-chalk-rule {
  height: 1px;
  background: linear-gradient(90deg, var(--app-accent) 0 64px, var(--app-border) 64px 100%);
}

.cc-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 18px;
}

.cc-counter {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.06em;
}

@media (max-width: 768px) {
  .company-craft-view { padding: 16px 16px 80px; }
  .cc-header h2 { font-size: 24px; }
  .cc-tagline { font-size: 18px; }
}
</style>
```

- [ ] **Step 3: Verify in dev server**

Run: `npm run dev`, navigate to `/#/company-craft`.
Expected: hero renders; empty state shows because no projects.

- [ ] **Step 4: Commit**

```bash
git add src/views/CompanyCraftView.vue src/components/company-craft/ProjectEmptyState.vue
git commit -m "feat(workshop): editorial hero + empty state"
```

---

### Task 12: Project card list + progress bar

**Files:**
- Create: `src/components/company-craft/ProjectCard.vue`
- Modify: `src/views/CompanyCraftView.vue`

- [ ] **Step 1: Implement `ProjectCard.vue`**

Create `src/components/company-craft/ProjectCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import { getProjectProgress, getRemainingMaterials } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { useBomStore } from '@/stores/bom'

const props = defineProps<{
  project: WorkshopProject
  sequences: CompanyCraftSequence[]   // pre-loaded CompanyCraft index
}>()

const emit = defineEmits<{
  expand: [projectId: string]
  sync: [projectId: string]
}>()

const bom = useBomStore()

const progress = computed(() => getProjectProgress(props.project, props.sequences))
const progressPct = computed(() => Math.round(progress.value * 100))

const totalPhases = computed(() => {
  let n = 0
  const seqById = new Map(props.sequences.map(s => [s.id, s]))
  for (const r of props.project.sequences) {
    const seq = seqById.get(r.sequenceId)
    if (seq) n += seq.phases.length * r.quantity
  }
  return n
})

const donePhases = computed(() => Math.round(progress.value * totalPhases.value))

const remainingCount = computed(() => {
  const m = getRemainingMaterials(props.project, props.sequences)
  return m.size
})

const isLinkedToBom = computed(() =>
  bom.targets.some(t => t.kind === 'company-craft-project' && t.projectId === props.project.id),
)

const icon = computed(() => {
  switch (props.project.category) {
    case 'submersible': return '🛰'
    case 'airship': return '✈'
    default: return '🛠'
  }
})

const categoryLabel = computed(() => {
  switch (props.project.category) {
    case 'submersible': return '潛水艇'
    case 'airship': return '飛空艇'
    default: return '工坊建材'
  }
})

const partsCount = computed(() => props.project.sequences.length)
const partsLabel = computed(() =>
  props.project.category === 'workshop'
    ? `${partsCount.value} 件`
    : `${partsCount.value} 零件`,
)
</script>

<template>
  <article class="card">
    <header class="card-head">
      <div class="card-icon">{{ icon }}</div>
      <div class="card-title-block">
        <h3 class="card-title">{{ project.name }}</h3>
        <div class="card-sub">{{ categoryLabel }} · {{ partsLabel }} · {{ donePhases }}/{{ totalPhases }} 階段完成</div>
      </div>
      <div class="card-actions">
        <el-button text @click="emit('expand', project.id)">展開</el-button>
        <el-button type="primary" @click="emit('sync', project.id)">
          {{ isLinkedToBom ? '前往購物清單 →' : '加入購物清單' }}
        </el-button>
      </div>
    </header>
    <div class="card-progress">
      <div class="bar"><div class="fill" :style="{ width: progressPct + '%' }" /></div>
      <span class="meta">
        {{ progressPct }}% · 剩 {{ remainingCount }} 種素材
        <span v-if="isLinkedToBom" class="linked"> · 已關聯 BOM</span>
      </span>
    </div>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-surface);
  padding: 20px 22px;
  margin-bottom: 14px;
  transition: background 0.15s var(--ease-out-quart),
              transform 0.15s var(--ease-out-quart),
              box-shadow 0.15s var(--ease-out-quart);
}
.card:hover {
  background: var(--app-surface-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--app-craft-dim);
}
.card-head {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 16px;
  align-items: center;
}
.card-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: var(--app-surface-2);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.card-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700; font-size: 18px;
  margin: 0;
}
.card-sub {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
  margin-top: 2px;
}
.card-actions { display: inline-flex; gap: 10px; }
.card-progress {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--app-border);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
}
.bar {
  height: 6px;
  background: var(--app-surface-2);
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--app-accent), var(--app-accent-light));
  border-radius: 999px;
  transition: width 0.25s var(--ease-out-quart);
}
.meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-craft);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.linked { color: var(--app-success); }

@media (max-width: 640px) {
  .card { padding: 16px; }
  .card-head { grid-template-columns: 40px 1fr; row-gap: 12px; }
  .card-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
```

- [ ] **Step 2: Wire into view**

In `src/views/CompanyCraftView.vue`, import `ProjectCard` and use it:

```ts
import ProjectCard from '@/components/company-craft/ProjectCard.vue'
import { useRouter } from 'vue-router'
import { useBomStore } from '@/stores/bom'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'

const router = useRouter()
const bom = useBomStore()
const sequences = ref<CompanyCraftSequence[]>([])

onMounted(async () => {
  sequences.value = await loadCompanyCraft()
  dataReady.value = true
})

const expandedId = ref<string | null>(null)
function onExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function onSync(projectId: string) {
  const proj = workshopStore.getProject(projectId)
  if (!proj) return
  const linked = bom.targets.some(t =>
    t.kind === 'company-craft-project' && t.projectId === projectId,
  )
  if (!linked) {
    bom.addTarget({
      kind: 'company-craft-project',
      projectId,
      itemId: -1,
      name: proj.name,
      icon: '',
      quantity: 1,
    })
  }
  router.push('/bom')
}
```

Inside the `cc-projects` block:

```html
<ProjectCard
  v-for="p in activeProjects"
  :key="p.id"
  :project="p"
  :sequences="sequences"
  @expand="onExpand"
  @sync="onSync"
/>
```

- [ ] **Step 3: Manual verify**

In dev tools, run:

```js
const store = window.__PINIA__?.state?.value?.['workshop-projects']
```

If not available, fall back to creating via dev tooling once Task 18 lands. For this commit, the cards render no projects — empty state still active.

- [ ] **Step 4: Commit**

```bash
git add src/views/CompanyCraftView.vue src/components/company-craft/ProjectCard.vue
git commit -m "feat(workshop): project card list with progress bar + sync CTA"
```

---

## Phase E · Phase board

### Task 13: PhaseBoard inline expansion with part groups

**Files:**
- Create: `src/components/company-craft/PhaseBoard.vue`
- Modify: `src/components/company-craft/ProjectCard.vue` (mount PhaseBoard when expanded)

- [ ] **Step 1: Create `PhaseBoard.vue`**

Create `src/components/company-craft/PhaseBoard.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { getItemSync, useItemName } from '@/services/local-data-source'
import PhaseRow from './PhaseRow.vue'

const props = defineProps<{
  project: WorkshopProject
  sequences: CompanyCraftSequence[]
}>()

// Map "sequenceId -> sequence" for this project's references
const linkedSequences = computed(() => {
  const seqById = new Map(props.sequences.map(s => [s.id, s]))
  return props.project.sequences
    .map(ref => ({ ref, seq: seqById.get(ref.sequenceId) }))
    .filter((x): x is { ref: typeof x.ref; seq: CompanyCraftSequence } => !!x.seq)
})

// Track which parts (by sequenceId) are expanded
const expandedParts = ref<Set<number>>(new Set())
function togglePart(seqId: number) {
  const next = new Set(expandedParts.value)
  if (next.has(seqId)) next.delete(seqId)
  else next.add(seqId)
  expandedParts.value = next
}

// Default: expand the first incomplete part on mount
function isPartExpanded(seqId: number) {
  return expandedParts.value.has(seqId)
}

function partLabel(slot: string | null, fallbackName: string) {
  if (slot === 'bow') return `船首 ${fallbackName}`
  if (slot === 'stern') return `船尾 ${fallbackName}`
  if (slot === 'hull') return `船身 ${fallbackName}`
  if (slot === 'bridge') return `船底 ${fallbackName}`
  return fallbackName
}

function getResultName(seq: CompanyCraftSequence): string {
  // Synchronous fetch from cached items map; may return placeholder if missing.
  const item = getItemSync(seq.resultItemId)
  return item?.name ?? `#${seq.resultItemId}`
}
</script>

<template>
  <div class="phase-board">
    <div class="parts-strip" v-if="project.category !== 'workshop'">
      <div
        v-for="{ seq } in linkedSequences"
        :key="seq.id"
        class="part-chip"
      >
        <span class="slot" v-if="seq.partSlot">
          {{ {
            bow: '船首', stern: '船尾', hull: '船身', bridge: '船底',
          }[seq.partSlot] }}
        </span>
        {{ getResultName(seq) }}
      </div>
    </div>

    <div
      v-for="{ ref, seq } in linkedSequences"
      :key="seq.id"
      class="part-group"
    >
      <button
        class="part-group-head"
        :aria-expanded="isPartExpanded(seq.id)"
        @click="togglePart(seq.id)"
      >
        <span>{{ isPartExpanded(seq.id) ? '▼' : '▶' }} {{ partLabel(seq.partSlot, getResultName(seq)) }}</span>
        <span class="meta">{{ seq.phases.length }} 階段 · 數量 {{ ref.quantity }}</span>
      </button>

      <div v-if="isPartExpanded(seq.id)" class="part-group-body">
        <PhaseRow
          v-for="(phase, idx) in seq.phases"
          :key="idx"
          :project-id="project.id"
          :sequence-id="seq.id"
          :phase="phase"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.phase-board {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--app-border);
}
.parts-strip {
  display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap;
}
.part-chip {
  background: var(--app-surface-2);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  padding: 5px 13px;
  font-size: 12px;
  display: inline-flex; align-items: center; gap: 6px;
}
.part-chip .slot {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--app-craft);
}
.part-group {
  margin-bottom: 18px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--app-surface);
}
.part-group-head {
  width: 100%;
  background: var(--app-surface-2);
  padding: 10px 16px;
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 15px;
  cursor: pointer;
  border: 0; text-align: left;
}
.part-group-head .meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px; color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.part-group-body > * + * { border-top: 1px solid var(--app-border); }
</style>
```

- [ ] **Step 2: Mount in `ProjectCard.vue`**

Add to `ProjectCard.vue` template after the `card-progress` block:

```html
<PhaseBoard
  v-if="expanded"
  :project="project"
  :sequences="sequences"
/>
```

And in `<script setup>`:

```ts
import PhaseBoard from './PhaseBoard.vue'
const props = defineProps<{ ... }>() // (existing)
defineProps<{ expanded?: boolean }>() // No — add expanded to existing props instead.
```

Actually replace the defineProps block to:

```ts
const props = defineProps<{
  project: WorkshopProject
  sequences: CompanyCraftSequence[]
  expanded?: boolean
}>()
```

And in `CompanyCraftView.vue` template, pass `:expanded="expandedId === p.id"`.

Also change the "展開" button text to react:

```html
<el-button text @click="emit('expand', project.id)">
  {{ expanded ? '收合' : '展開' }}
</el-button>
```

- [ ] **Step 3: Manual verify**

Run `npm run dev`. After Task 18 lands and a project can be created, expand works.

- [ ] **Step 4: Commit**

```bash
git add src/components/company-craft/PhaseBoard.vue src/components/company-craft/ProjectCard.vue src/views/CompanyCraftView.vue
git commit -m "feat(workshop): phase board with collapsible part groups"
```

---

### Task 14: PhaseRow with status + supply items

**Files:**
- Create: `src/components/company-craft/PhaseRow.vue`
- Create: `src/components/company-craft/SupplyItemCounter.vue`

- [ ] **Step 1: Implement `SupplyItemCounter.vue`**

Create `src/components/company-craft/SupplyItemCounter.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'

const props = defineProps<{
  projectId: string
  phaseKey: string
  supplyIndex: number
  max: number
}>()

const store = useWorkshopProjectsStore()
const value = computed(() => store.getDelivered(props.projectId, props.phaseKey, props.supplyIndex))
const isFull = computed(() => value.value >= props.max)

function dec() {
  store.setDelivered(props.projectId, props.phaseKey, props.supplyIndex, Math.max(0, value.value - 1))
}
function inc() {
  store.setDelivered(props.projectId, props.phaseKey, props.supplyIndex, Math.min(props.max, value.value + 1))
}
function onInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value) || 0
  store.setDelivered(props.projectId, props.phaseKey, props.supplyIndex, Math.max(0, Math.min(props.max, raw)))
}
</script>

<template>
  <div class="counter">
    <button class="step" :disabled="value === 0" @click="dec">−</button>
    <input
      type="number"
      class="count"
      :class="{ full: isFull }"
      :value="value"
      :max="max"
      min="0"
      @change="onInput"
    />
    <span class="sep">/</span>
    <span class="max">{{ max }}</span>
    <button class="step" :disabled="isFull" @click="inc">+</button>
  </div>
</template>

<style scoped>
.counter {
  display: inline-flex; align-items: center;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  overflow: hidden;
  font-family: 'Fira Code', monospace;
}
.step {
  width: 28px; height: 28px;
  background: transparent; border: 0;
  color: var(--app-craft);
  font-weight: 600; font-size: 14px;
  cursor: pointer;
}
.step:hover:not(:disabled) { background: var(--app-surface-hover); }
.step:disabled { opacity: 0.4; cursor: not-allowed; }
.count {
  width: 36px;
  border: 0; background: transparent;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: var(--app-text);
  text-align: right;
  letter-spacing: 0.06em;
  outline: none;
}
.count.full { color: var(--app-success); font-weight: 600; }
.count::-webkit-outer-spin-button,
.count::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.sep { color: var(--app-text-muted); padding: 0 2px; }
.max { color: var(--app-text-muted); font-size: 12px; padding-right: 8px; }
</style>
```

- [ ] **Step 2: Implement `PhaseRow.vue`**

Create `src/components/company-craft/PhaseRow.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { CompanyCraftPhase } from '@/services/local-data-source.types'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  isPhaseComplete,
} from '@/stores/workshop-projects'
import { useItemName } from '@/composables/useItemName'
import SupplyItemCounter from './SupplyItemCounter.vue'

const props = defineProps<{
  projectId: string
  sequenceId: number
  phase: CompanyCraftPhase
}>()

const store = useWorkshopProjectsStore()

const phaseKey = computed(() => serializePhaseKey({
  sequenceId: props.sequenceId,
  partIndex: props.phase.partIndex,
  processIndex: props.phase.processIndex,
}))

const project = computed(() => store.getProject(props.projectId))

const complete = computed(() => {
  return project.value ? isPhaseComplete(project.value, props.phase, phaseKey.value) : false
})

const deliveredCount = computed(() => {
  if (!project.value) return 0
  let n = 0
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    n += store.getDelivered(props.projectId, phaseKey.value, i)
  }
  return n
})

const totalCount = computed(() =>
  props.phase.supplyItems.reduce((sum, s) => sum + s.amount, 0),
)

const progressPct = computed(() =>
  totalCount.value === 0 ? 0 : Math.round((deliveredCount.value / totalCount.value) * 100),
)

const started = computed(() => deliveredCount.value > 0)

function markAllDelivered() {
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    store.setDelivered(props.projectId, phaseKey.value, i, props.phase.supplyItems[i].amount)
  }
}
</script>

<template>
  <div class="phase-row" :class="{ active: started && !complete, done: complete }">
    <div class="head">
      <span class="status" :class="{ done: complete, active: started && !complete }">
        <template v-if="complete">✓</template>
        <template v-else-if="started">●</template>
      </span>
      <span class="job-badge" :class="{ idle: !started && !complete }">
        {{ phase.jobAbbr }}{{ phase.level ? ' ' + phase.level : '' }}
      </span>
      <span class="name">Phase {{ phase.processIndex + 1 }}</span>
      <span class="progress">
        {{ complete ? '完成' : (started ? `進行中 ${progressPct}%` : '未開工') }}
      </span>
    </div>

    <div v-if="started && !complete" class="mini-progress">
      <div class="fill" :style="{ width: progressPct + '%' }" />
    </div>

    <div v-if="started || !complete" class="supplies">
      <div
        v-for="(supply, i) in phase.supplyItems"
        :key="i"
        class="supply"
      >
        <span class="supply-name">{{ useItemName(supply.itemId).value || `#${supply.itemId}` }}</span>
        <SupplyItemCounter
          :project-id="projectId"
          :phase-key="phaseKey"
          :supply-index="i"
          :max="supply.amount"
        />
      </div>
    </div>

    <div v-if="!complete" class="actions">
      <el-button size="small" text @click="markAllDelivered">全部繳清</el-button>
    </div>
  </div>
</template>

<style scoped>
.phase-row {
  padding: 10px 16px;
}
.phase-row.active { background: var(--app-accent-glow); }
.phase-row.done .status { color: var(--app-success); }

.head {
  display: grid;
  grid-template-columns: 22px 80px 1fr auto;
  gap: 12px; align-items: center;
}
.status {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid var(--app-border);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; color: transparent;
}
.status.done {
  background: var(--app-success-tint);
  border-color: var(--app-success);
  color: var(--app-success);
}
.status.active {
  background: var(--app-accent-glow);
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.job-badge {
  display: inline-block; padding: 2px 7px;
  background: var(--app-craft);
  color: var(--app-surface);
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-align: center;
}
.job-badge.idle { background: var(--app-text-muted); }
.name { font-size: 14px; }
.progress {
  font-family: 'Fira Code', monospace;
  font-size: 11px; color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.mini-progress {
  height: 4px;
  margin: 10px 0 12px 116px;
  background: var(--app-surface-2);
  border-radius: 999px;
  overflow: hidden;
}
.mini-progress .fill {
  height: 100%; background: var(--app-accent);
  transition: width 0.2s var(--ease-out-quart);
}
.supplies {
  margin: 10px 0 4px 116px;
  padding: 12px 14px;
  background: var(--app-surface-2);
  border-radius: 8px;
}
.supply {
  display: grid; grid-template-columns: 1fr auto;
  align-items: center; padding: 5px 0;
  border-bottom: 1px dashed var(--app-border);
}
.supply:last-child { border-bottom: 0; }
.supply-name { font-size: 13px; }
.actions { margin: 8px 0 4px 116px; }

@media (max-width: 640px) {
  .head { grid-template-columns: 22px 80px 1fr; }
  .head .progress { grid-column: 1 / -1; margin-left: 116px; }
  .supplies, .mini-progress, .actions { margin-left: 0; }
}
</style>
```

- [ ] **Step 3: Manual smoke test**

In dev tools, create a project programmatically (the dialog will land in next phase). For now seed via console:

```js
const pinia = window.__PINIA__ ?? null
// ... or in test fixture: write a small Vue dev fixture to render the view
```

- [ ] **Step 4: Commit**

```bash
git add src/components/company-craft/PhaseRow.vue src/components/company-craft/SupplyItemCounter.vue
git commit -m "feat(workshop): phase row with status, supply counters, mini progress"
```

---

### Task 15: Quick action — 標記下一階段

**Files:**
- Modify: `src/components/company-craft/PhaseRow.vue`

- [ ] **Step 1: Add `mark-next` emit**

In `PhaseRow.vue` script:

```ts
const emit = defineEmits<{
  'mark-next': []
}>()

function markPhaseAndAdvance() {
  markAllDelivered()
  emit('mark-next')
}
```

In template, replace the actions block:

```html
<div v-if="!complete" class="actions">
  <el-button size="small" text @click="markAllDelivered">全部繳清</el-button>
  <el-button size="small" type="primary" plain @click="markPhaseAndAdvance">
    標記下一階段
  </el-button>
</div>
```

- [ ] **Step 2: Wire to PhaseBoard auto-scroll**

In `PhaseBoard.vue`, add a `tplRefs` to scroll the next un-done phase into view:

```ts
import { nextTick } from 'vue'

function onMarkNext(seqId: number) {
  // Find first non-complete phase after current; rely on store reactivity
  nextTick(() => {
    const rows = document.querySelectorAll(`.part-group[data-seq="${seqId}"] .phase-row:not(.done)`)
    if (rows.length > 0) (rows[0] as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}
```

Add `:data-seq="seq.id"` to the part-group div, and listen on `PhaseRow`:

```html
<PhaseRow
  ...
  @mark-next="onMarkNext(seq.id)"
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/company-craft/PhaseRow.vue src/components/company-craft/PhaseBoard.vue
git commit -m "feat(workshop): quick action 標記下一階段 + scroll into view"
```

---

## Phase F · 新增專案 dialog

### Task 16: NewProjectDialog shell + Step 1 (type pick)

**Files:**
- Create: `src/components/company-craft/NewProjectDialog.vue`
- Modify: `src/views/CompanyCraftView.vue`

- [ ] **Step 1: Implement dialog shell with three steps**

Create `src/components/company-craft/NewProjectDialog.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CompanyCraftCategory } from '@/services/local-data-source.types'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [projectId: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const step = ref<1 | 2 | 3>(1)
const category = ref<CompanyCraftCategory | null>(null)

function reset() {
  step.value = 1
  category.value = null
}

watch(visible, v => {
  if (v) reset()
})

function pickCategory(c: CompanyCraftCategory) {
  category.value = c
}
function nextStep() {
  if (step.value === 1 && category.value) step.value = 2
  else if (step.value === 2) step.value = 3
}
function prevStep() {
  if (step.value === 2) step.value = 1
  else if (step.value === 3) step.value = 2
}
</script>

<template>
  <el-dialog v-model="visible" :width="560" :show-close="false" align-center class="cc-dialog">
    <template #header>
      <div class="head">
        <h4>{{ step === 1 ? '新增專案' : step === 2 ? '配置零件' : '命名專案' }}</h4>
        <span class="step-counter">Step {{ step }} / 3</span>
      </div>
    </template>

    <!-- Step 1: type -->
    <div v-if="step === 1" class="step1">
      <h5>做什麼？</h5>
      <div class="type-grid">
        <button
          v-for="opt in [
            { c: 'submersible', icon: '🛰', name: '潛水艇', hint: '4 零件' },
            { c: 'airship', icon: '✈', name: '飛空艇', hint: '4 零件' },
            { c: 'workshop', icon: '🛠', name: '工坊建材', hint: '單件' },
          ] as const"
          :key="opt.c"
          class="type-card"
          :class="{ active: category === opt.c }"
          @click="pickCategory(opt.c)"
        >
          <div class="icon">{{ opt.icon }}</div>
          <div class="name">{{ opt.name }}</div>
          <div class="hint">{{ opt.hint }}</div>
        </button>
      </div>
    </div>

    <!-- Step 2 & 3 stubs filled in next tasks -->
    <div v-else-if="step === 2" class="step2">
      <p style="color: var(--app-text-muted);">[Task 17/18 will fill this]</p>
    </div>
    <div v-else class="step3">
      <p style="color: var(--app-text-muted);">[Task 19 will fill this]</p>
    </div>

    <template #footer>
      <div class="footer">
        <el-button v-if="step === 1" @click="visible = false">取消</el-button>
        <el-button v-else @click="prevStep">← 上一步</el-button>
        <el-button
          type="primary"
          :disabled="step === 1 && !category"
          @click="step === 3 ? null : nextStep()"
        >
          {{ step === 3 ? '建立並開始 →' : '下一步 →' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; }
.head h4 {
  margin: 0; font-family: 'Noto Serif TC', serif;
  font-weight: 700; font-size: 20px;
}
.step-counter {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--app-text-muted);
  text-transform: uppercase;
}
.step1 h5 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 15px;
  margin: 0 0 16px;
}
.type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.type-card {
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 18px 12px;
  text-align: center;
  background: var(--app-surface);
  cursor: pointer;
  transition: all 0.15s var(--ease-out-quart);
}
.type-card:hover {
  background: var(--app-surface-hover);
  border-color: var(--app-accent);
  transform: translateY(-1px);
}
.type-card.active {
  background: var(--app-accent-glow);
  border-color: var(--app-accent);
  border-width: 2px;
}
.type-card .icon { font-size: 32px; margin-bottom: 6px; }
.type-card .name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 15px;
}
.type-card .hint {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  color: var(--app-text-muted);
  letter-spacing: 0.06em;
  margin-top: 4px;
}
.footer { display: flex; justify-content: space-between; }

@media (max-width: 640px) {
  .type-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
```

- [ ] **Step 2: Mount in view**

In `CompanyCraftView.vue` template, before the closing `</div>`:

```html
<NewProjectDialog v-model="newDialogOpen" />
```

And import:

```ts
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'
```

- [ ] **Step 3: Manual verify**

Run `npm run dev`, click「新增專案」, dialog opens at Step 1; 3 cards; Picking activates; 下一步 disabled when nothing picked.

- [ ] **Step 4: Commit**

```bash
git add src/components/company-craft/NewProjectDialog.vue src/views/CompanyCraftView.vue
git commit -m "feat(workshop): new-project dialog shell + Step 1 type pick"
```

---

### Task 17: Step 2 — submersible/airship 4-slot config

**Files:**
- Modify: `src/components/company-craft/NewProjectDialog.vue`

- [ ] **Step 1: Wire 4-slot picker**

In `NewProjectDialog.vue` `<script setup>`, add:

```ts
import { listCompanyCraftByCategory, getItemSync } from '@/services/local-data-source'
import type { CompanyCraftSequence, PartSlot } from '@/services/local-data-source.types'
import { getTotalMaterials } from '@/stores/workshop-projects'
import { useSettingsStore } from '@/stores/settings'
import { useBomStore, getPrice } from '@/stores/bom'

const slots: PartSlot[] = ['bow', 'stern', 'hull', 'bridge']
const slotLabel: Record<PartSlot, string> = {
  bow: '船首', stern: '船尾', hull: '船身', bridge: '船底',
}

const slotChoices = ref<Record<PartSlot, number | null>>({
  bow: null, stern: null, hull: null, bridge: null,
})

const slotOptions = computed(() => {
  if (!category.value || category.value === 'workshop') return {}
  const out: Record<PartSlot, CompanyCraftSequence[]> = {
    bow: [], stern: [], hull: [], bridge: [],
  }
  for (const slot of slots) {
    out[slot] = listCompanyCraftByCategory(category.value, slot)
  }
  return out
})

// Workshop step 2 (search): hold pick separately
const workshopPickId = ref<number | null>(null)
const workshopFilter = ref('')

const workshopMatches = computed(() => {
  if (category.value !== 'workshop') return []
  const all = listCompanyCraftByCategory('workshop')
  const q = workshopFilter.value.trim().toLowerCase()
  if (!q) return all.slice(0, 40)
  return all.filter(s => {
    const name = getItemSync(s.resultItemId)?.name ?? ''
    return name.toLowerCase().includes(q)
  }).slice(0, 40)
})

// Estimated totals for selected sequences (shared by step 2 and 3)
const selectedSequences = computed<CompanyCraftSequence[]>(() => {
  if (category.value === 'workshop') {
    const id = workshopPickId.value
    if (id == null) return []
    const all = listCompanyCraftByCategory('workshop')
    const seq = all.find(s => s.id === id)
    return seq ? [seq] : []
  }
  const out: CompanyCraftSequence[] = []
  for (const slot of slots) {
    const id = slotChoices.value[slot]
    if (id == null) continue
    const all = slotOptions.value[slot] ?? []
    const seq = all.find(s => s.id === id)
    if (seq) out.push(seq)
  }
  return out
})

const settings = useSettingsStore()
const bom = useBomStore()

const estimate = computed(() => {
  // Fake project: 1× each selected sequence for total estimation
  const fakeProj = {
    id: '_preview', name: '_', category: category.value!,
    createdAt: 0, sequences: selectedSequences.value.map(s => ({ sequenceId: s.id, quantity: 1 })),
    phaseProgress: {},
  } as const
  const totals = getTotalMaterials(fakeProj as never, selectedSequences.value)
  let kinds = totals.size
  let gilEstimate = 0
  for (const [itemId, amount] of totals) {
    const price = bom.prices.get(itemId)
    if (price) gilEstimate += getPrice(price, settings.priceDisplayMode) * amount
  }
  let totalPhases = 0
  for (const s of selectedSequences.value) totalPhases += s.phases.length
  return { kinds, gilEstimate, totalPhases }
})

function getResultName(seq: CompanyCraftSequence): string {
  return getItemSync(seq.resultItemId)?.name ?? `#${seq.resultItemId}`
}

// Allow next when at least 1 sequence picked
const canProceedFromStep2 = computed(() => selectedSequences.value.length > 0)
```

In template, replace the `<div v-else-if="step === 2">` block:

```html
<div v-else-if="step === 2" class="step2">
  <!-- submersible / airship -->
  <template v-if="category !== 'workshop'">
    <h5>選擇 4 個零件（可留空槽）</h5>
    <div
      v-for="slot in slots"
      :key="slot"
      class="slot-row"
    >
      <span class="slot-label">{{ slotLabel[slot] }}</span>
      <el-select
        v-model="slotChoices[slot]"
        clearable
        :placeholder="'— 選擇 —'"
        class="slot-select"
      >
        <el-option
          v-for="seq in slotOptions[slot]"
          :key="seq.id"
          :value="seq.id"
          :label="getResultName(seq)"
        />
      </el-select>
    </div>
  </template>

  <!-- workshop -->
  <template v-else>
    <h5>選擇建材</h5>
    <el-input
      v-model="workshopFilter"
      placeholder="搜尋建材名…"
      class="ws-search"
      clearable
    />
    <div class="ws-list">
      <button
        v-for="seq in workshopMatches"
        :key="seq.id"
        class="ws-item"
        :class="{ active: workshopPickId === seq.id }"
        @click="workshopPickId = seq.id"
      >
        {{ getResultName(seq) }}
      </button>
    </div>
  </template>

  <div class="preview" v-if="estimate.kinds > 0">
    預估總素材 <strong>{{ estimate.kinds }} 種</strong>
    <span v-if="estimate.gilEstimate > 0">
      ， 估價 <strong>{{ estimate.gilEstimate.toLocaleString() }} gil</strong>
    </span>
    ， <strong>{{ estimate.totalPhases }} 個 Phase</strong>
  </div>
</div>
```

Update the footer's 下一步 disabled check:

```html
<el-button
  type="primary"
  :disabled="
    (step === 1 && !category) ||
    (step === 2 && !canProceedFromStep2)
  "
  @click="step === 3 ? createAndClose() : nextStep()"
>
```

Add styles:

```css
.slot-row {
  display: grid; grid-template-columns: 56px 1fr;
  gap: 12px; align-items: center;
  padding: 9px 0;
  border-bottom: 1px dashed var(--app-border);
}
.slot-row:last-child { border-bottom: 0; }
.slot-label {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 14px;
  color: var(--app-craft);
}
.slot-select { width: 100%; }
.preview {
  margin-top: 18px;
  padding: 12px 16px;
  background: var(--app-surface-2);
  border-radius: 10px;
  font-size: 13px;
}
.preview strong {
  font-family: 'Fira Code', monospace;
  color: var(--app-accent);
}
.ws-search { margin-bottom: 12px; }
.ws-list {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.ws-item {
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--app-border);
}
.ws-item:last-child { border-bottom: 0; }
.ws-item:hover { background: var(--app-surface-hover); }
.ws-item.active { background: var(--app-accent-glow); color: var(--app-accent); font-weight: 600; }
```

- [ ] **Step 2: Manual verify**

Run `npm run dev` (assuming Task 2 produced `company-craft.json`). Open dialog → pick 潛水艇 → step 2 shows 4 slot selectors with real names from the data. Pick a bow → preview shows estimate.

- [ ] **Step 3: Commit**

```bash
git add src/components/company-craft/NewProjectDialog.vue
git commit -m "feat(workshop): new-project Step 2 (4-slot picker + workshop search)"
```

---

### Task 18: Step 3 — naming + create

**Files:**
- Modify: `src/components/company-craft/NewProjectDialog.vue`

- [ ] **Step 1: Wire Step 3 naming + project creation**

In `NewProjectDialog.vue` script, add:

```ts
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'

const workshopStore = useWorkshopProjectsStore()
const projectName = ref('')

// Auto-fill default name: first sequence's result name + (for sub/airship) 「號」
watch(selectedSequences, (seqs) => {
  if (projectName.value.trim()) return // user already typed
  if (seqs.length === 0) {
    projectName.value = ''
    return
  }
  const firstName = getResultName(seqs[0])
  // strip part suffix to get base hull name (best effort)
  const base = firstName.replace(/\s*(Bow|Stern|Hull|Bridge|船首|船尾|船身|船底)\s*$/i, '').trim()
  if (category.value === 'workshop') {
    projectName.value = firstName
  } else {
    projectName.value = base ? `${base} 號` : firstName
  }
})

function createAndClose() {
  if (!category.value) return
  if (!projectName.value.trim()) return
  const id = workshopStore.createProject({
    name: projectName.value.trim(),
    category: category.value,
    sequences: selectedSequences.value.map(s => ({ sequenceId: s.id, quantity: 1 })),
  })
  emit('created', id)
  visible.value = false
}
```

In template, replace Step 3 block:

```html
<div v-else class="step3">
  <h5>專案名稱</h5>
  <el-input v-model="projectName" placeholder="輸入專案名稱…" />
  <p class="hint">↑ 自動填入，可改</p>
  <div class="preview">
    總素材 <strong>{{ estimate.kinds }} 種</strong> ·
    <span v-if="estimate.gilEstimate > 0">
      估價 <strong>{{ estimate.gilEstimate.toLocaleString() }} gil</strong> ·
    </span>
    Phase 總數 <strong>{{ estimate.totalPhases }}</strong>
  </div>
</div>
```

Update footer button disabled condition:

```html
<el-button
  type="primary"
  :disabled="
    (step === 1 && !category) ||
    (step === 2 && !canProceedFromStep2) ||
    (step === 3 && !projectName.trim())
  "
  @click="step === 3 ? createAndClose() : nextStep()"
>
  {{ step === 3 ? '建立並開始 →' : '下一步 →' }}
</el-button>
```

Add styles:

```css
.step3 h5 { margin: 0 0 8px; font-family: 'Noto Serif TC', serif; font-weight: 600; }
.hint {
  font-size: 11px; color: var(--app-text-muted);
  font-family: 'Fira Code', monospace;
  letter-spacing: 0.04em;
  margin: 6px 0 0;
}
```

- [ ] **Step 2: Wire `created` event in view**

In `CompanyCraftView.vue`, modify the dialog markup:

```html
<NewProjectDialog
  v-model="newDialogOpen"
  @created="onProjectCreated"
/>
```

Add handler:

```ts
function onProjectCreated(projectId: string) {
  expandedId.value = projectId
  ElMessage.success('專案已建立')
}
```

- [ ] **Step 3: Manual verify**

Run `npm run dev` → create a sub project with at least 1 part → it appears in My Projects + auto-expands.

- [ ] **Step 4: Commit**

```bash
git add src/components/company-craft/NewProjectDialog.vue src/views/CompanyCraftView.vue
git commit -m "feat(workshop): new-project Step 3 naming + creation"
```

---

### Task 19: PhaseBoard component smoke test

**Files:**
- Create: `src/__tests__/components/company-craft/PhaseBoard.test.ts`

- [ ] **Step 1: Write smoke test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PhaseBoard from '@/components/company-craft/PhaseBoard.vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'

beforeEach(() => setActivePinia(createPinia()))

const seq: CompanyCraftSequence = {
  id: 1, resultItemId: 18715, category: 'submersible', partSlot: 'bow',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
      supplyItems: [{ itemId: 5057, amount: 12 }] },
  ],
}

describe('PhaseBoard', () => {
  it('renders one part group per linked sequence', async () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'submersible',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })
    const wrapper = mount(PhaseBoard, {
      props: { project: store.getProject(id)!, sequences: [seq] },
    })
    await flushPromises()
    expect(wrapper.findAll('.part-group').length).toBe(1)
  })

  it('toggles part expansion on header click', async () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'submersible',
      sequences: [{ sequenceId: 1, quantity: 1 }],
    })
    const wrapper = mount(PhaseBoard, {
      props: { project: store.getProject(id)!, sequences: [seq] },
    })
    expect(wrapper.find('.part-group-body').exists()).toBe(false)
    await wrapper.find('.part-group-head').trigger('click')
    expect(wrapper.find('.part-group-body').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run**

`npm test -- PhaseBoard`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/company-craft/PhaseBoard.test.ts
git commit -m "test(workshop): phase board smoke test"
```

---

## Phase G · Polish

### Task 20: Delete project — confirm dialog

**Files:**
- Modify: `src/components/company-craft/ProjectCard.vue`
- Modify: `src/views/CompanyCraftView.vue`

- [ ] **Step 1: Add delete action to ProjectCard**

In `ProjectCard.vue`, add emit:

```ts
const emit = defineEmits<{
  expand: [id: string]
  sync: [id: string]
  delete: [id: string]
}>()
```

Add a kebab menu in card-actions (between 展開 and 同步):

```html
<el-dropdown trigger="click">
  <el-button text>⋯</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item @click="emit('delete', project.id)">刪除專案</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

- [ ] **Step 2: Handle delete with confirm in view**

In `CompanyCraftView.vue`:

```ts
import { ElMessageBox } from 'element-plus'

async function onDelete(id: string) {
  const proj = workshopStore.getProject(id)
  if (!proj) return
  try {
    await ElMessageBox.confirm(
      `確定刪除「${proj.name}」？已記錄的階段進度會一起移除。`,
      '刪除專案',
      { confirmButtonText: '刪除', cancelButtonText: '取消', type: 'warning' },
    )
    // also clear linked BOM target
    bom.targets = bom.targets.filter(t =>
      !(t.kind === 'company-craft-project' && t.projectId === id),
    )
    workshopStore.deleteProject(id)
    ElMessage.success('專案已刪除')
  } catch {
    // user cancelled
  }
}
```

Pass to template:

```html
<ProjectCard
  ...
  @delete="onDelete"
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/company-craft/ProjectCard.vue src/views/CompanyCraftView.vue
git commit -m "feat(workshop): delete project with confirm + linked BOM cleanup"
```

---

### Task 21: Loading / error states

**Files:**
- Modify: `src/views/CompanyCraftView.vue`

- [ ] **Step 1: Add error state**

```ts
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    sequences.value = await loadCompanyCraft()
  } catch (err) {
    loadError.value = (err as Error).message
    return
  }
  dataReady.value = true
})

async function retryLoad() {
  loadError.value = null
  dataReady.value = false
  try {
    sequences.value = await loadCompanyCraft()
    dataReady.value = true
  } catch (err) {
    loadError.value = (err as Error).message
  }
}
```

In template, after `<header>`:

```html
<div v-if="loadError" class="cc-error">
  <p>圖紙抽屜卡住了，請重試。<span class="detail">({{ loadError }})</span></p>
  <el-button type="primary" @click="retryLoad">重試</el-button>
</div>
```

Add CSS:

```css
.cc-error {
  padding: 32px;
  border: 1px solid var(--app-warning-border);
  background: var(--app-warning-tint);
  border-radius: 12px;
  text-align: center;
}
.cc-error .detail {
  display: block;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  margin-top: 4px;
}
```

- [ ] **Step 2: Verify by stubbing fetch in devtools**

Open the network panel, block `company-craft.json`, reload. Error state should render with 重試 button.

- [ ] **Step 3: Commit**

```bash
git add src/views/CompanyCraftView.vue
git commit -m "feat(workshop): loading skeleton + error state with retry"
```

---

### Task 22: Analytics events

**Files:**
- Modify: `src/stores/workshop-projects.ts`
- Modify: `src/views/CompanyCraftView.vue`
- Modify: `src/components/company-craft/NewProjectDialog.vue`
- Modify: `src/components/company-craft/PhaseRow.vue`

- [ ] **Step 1: Track events in NewProjectDialog.createAndClose**

```ts
import { trackEvent } from '@/utils/analytics'

function createAndClose() {
  // ...
  trackEvent('workshop_project_create', {
    category: category.value!,
    sequence_count: selectedSequences.value.length,
    has_all_parts:
      category.value === 'workshop'
        ? true
        : selectedSequences.value.length === 4,
  })
  // ... rest
}
```

- [ ] **Step 2: Track sync + delete in view**

In `onSync`, after `bom.addTarget`:

```ts
trackEvent('workshop_project_sync_to_bom', { project_id: projectId })
```

In `onDelete`, after `workshopStore.deleteProject`:

```ts
trackEvent('workshop_project_delete', { project_id: id })
```

- [ ] **Step 3: Track phase complete in store**

In `workshop-projects.ts`, wrap `setDelivered` so it detects phase transitions:

```ts
import { trackEvent } from '@/utils/analytics'

function setDelivered(projectId: string, phaseKey: string, supplyIndex: number, value: number) {
  // ... existing logic
  // After mutating, check phase complete transition
  const proj = getProject(projectId)
  if (!proj) return
  // Caller doesn't know phase boundaries — analytics tracking moved to PhaseRow instead.
}
```

(Move analytics call up to the UI where we have the phase context. In `PhaseRow.vue`'s `markPhaseAndAdvance`:)

```ts
function markPhaseAndAdvance() {
  markAllDelivered()
  trackEvent('workshop_project_phase_completed', {
    project_id: props.projectId,
    phase_index: props.phase.partIndex * 10 + props.phase.processIndex,
  })
  emit('mark-next')
}
```

- [ ] **Step 4: Track project completion**

In `CompanyCraftView.vue`, add a watcher:

```ts
watch(
  () => workshopStore.projects.map(p => ({
    id: p.id, completedAt: p.completedAt,
    progress: getProjectProgress(p, sequences.value),
  })),
  (next, prev) => {
    if (!prev) return
    for (const cur of next) {
      const before = prev.find(p => p.id === cur.id)
      if (!before) continue
      if (cur.progress >= 1 && before.progress < 1) {
        const proj = workshopStore.getProject(cur.id)
        if (proj && !proj.completedAt) {
          workshopStore.markCompleted(cur.id)
          trackEvent('workshop_project_completed', {
            project_id: cur.id,
            days_to_complete: Math.round((Date.now() - proj.createdAt) / (1000 * 60 * 60 * 24)),
          })
          ElMessage.success(`「${proj.name}」全階段完成！`)
        }
      }
    }
  },
  { deep: true },
)
import { getProjectProgress } from '@/stores/workshop-projects'
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/workshop-projects.ts src/views/CompanyCraftView.vue src/components/company-craft/NewProjectDialog.vue src/components/company-craft/PhaseRow.vue
git commit -m "feat(workshop): analytics events (create / sync / phase / complete / delete)"
```

---

### Task 23: NewProjectDialog smoke test

**Files:**
- Create: `src/__tests__/components/company-craft/NewProjectDialog.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'

vi.mock('@/services/local-data-source', () => ({
  listCompanyCraftByCategory: vi.fn(() => []),
  getItemSync: vi.fn(() => ({ name: 'Test Item', level: 1, canBeHq: false, iconId: 0 })),
  loadCompanyCraft: vi.fn(async () => []),
  loadingState: { 'zh-TW': { recipes: false, items: false, rlt: false } },
}))

beforeEach(() => setActivePinia(createPinia()))

describe('NewProjectDialog', () => {
  it('starts on Step 1 with all three type cards', async () => {
    const wrapper = mount(NewProjectDialog, {
      props: { modelValue: true },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.findAll('.type-card').length).toBe(3)
    expect(wrapper.text()).toContain('Step 1 / 3')
  })

  it('disables next button until a type is picked', async () => {
    const wrapper = mount(NewProjectDialog, {
      props: { modelValue: true },
      attachTo: document.body,
    })
    await flushPromises()
    const nextBtn = wrapper.findAll('.el-button').find(b => b.text().includes('下一步'))
    expect(nextBtn?.attributes('disabled')).toBeDefined()
    await wrapper.findAll('.type-card')[0].trigger('click')
    expect(nextBtn?.attributes('disabled')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run**

`npm test -- NewProjectDialog`
Expected: 2 pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/company-craft/NewProjectDialog.test.ts
git commit -m "test(workshop): new-project dialog smoke test"
```

---

### Task 24: Mobile adaptation polish

**Files:**
- Modify: `src/views/CompanyCraftView.vue`
- Modify: `src/components/company-craft/ProjectCard.vue`
- Modify: `src/components/company-craft/PhaseRow.vue`

- [ ] **Step 1: Audit on mobile width**

Use Chrome DevTools to render at 375px width.

Expected issues to fix:
- Card actions need to wrap below name on narrow screens (already stubbed in Task 12 CSS, verify)
- Phase row's mini-progress / supplies need to stop indenting on mobile
- Dialog full-screen on mobile

- [ ] **Step 2: Add mobile rules**

In `NewProjectDialog.vue`, add `fullscreen-on-mobile`:

```html
<el-dialog
  v-model="visible"
  :width="560"
  :show-close="false"
  align-center
  class="cc-dialog"
  :fullscreen="isMobile"
>
```

```ts
import { useMediaQuery } from '@vueuse/core' // already in deps? if not, use simple matchMedia
const isMobile = ref(false)
onMounted(() => {
  const mq = window.matchMedia('(max-width: 640px)')
  isMobile.value = mq.matches
  mq.addEventListener('change', e => { isMobile.value = e.matches })
})
```

If `@vueuse/core` isn't installed (it isn't in package.json), use the manual matchMedia approach above.

- [ ] **Step 3: Add view-level scroll-margin for sticky toolbar**

In `CompanyCraftView.vue` `<style scoped>`, add:

```css
@media (max-width: 768px) {
  .company-craft-view {
    padding: 12px 12px 80px;
  }
  .cc-header { margin-bottom: 20px; }
  .cc-toolbar { flex-wrap: wrap; gap: 10px; }
}
```

- [ ] **Step 4: Manual verify**

Run `npm run dev`, switch DevTools to 375×667. All states look good.

- [ ] **Step 5: Commit**

```bash
git add src/views/CompanyCraftView.vue src/components/company-craft/ProjectCard.vue src/components/company-craft/PhaseRow.vue src/components/company-craft/NewProjectDialog.vue
git commit -m "polish(workshop): mobile layout adjustments"
```

---

### Task 25: A11y polish + changelog entry

**Files:**
- Modify: `src/components/company-craft/PhaseRow.vue`
- Modify: `src/components/company-craft/PhaseBoard.vue`
- Modify: `src/views/ChangelogView.vue`

- [ ] **Step 1: Add ARIA attributes to phase row + part group head**

In `PhaseBoard.vue`, ensure `.part-group-head` button already has `:aria-expanded="isPartExpanded(seq.id)"` (added in Task 13 — verify and fix if missing).

In `PhaseRow.vue`, ensure the supply counter input has a meaningful label. Wrap the counter:

```html
<label class="supply">
  <span class="supply-name">{{ useItemName(supply.itemId).value || `#${supply.itemId}` }}</span>
  <SupplyItemCounter
    :project-id="projectId"
    :phase-key="phaseKey"
    :supply-index="i"
    :max="supply.amount"
    :aria-label="`已繳數量 ${useItemName(supply.itemId).value} 最多 ${supply.amount}`"
  />
</label>
```

In `SupplyItemCounter.vue`, accept `ariaLabel` prop on input:

```vue
<input
  type="number"
  class="count"
  :class="{ full: isFull }"
  :aria-label="ariaLabel ?? '已繳數量'"
  ...
```

```ts
defineProps<{
  projectId: string
  phaseKey: string
  supplyIndex: number
  max: number
  ariaLabel?: string
}>()
```

- [ ] **Step 2: Update ChangelogView with new version**

Run `git tag --sort=-v:refname | head -1` to find the latest tag. Then in `src/views/ChangelogView.vue`, add a new entry at the top of the version list (refer to existing entries for format). Sample:

```html
<section class="changelog-entry">
  <span class="version">v2.15.0</span>
  <span class="date">2026-05-{DD}</span>
  <h3>部隊工坊（實驗中）</h3>
  <ul>
    <li>新增「部隊工坊」頁面：追蹤潛水艇 / 飛空艇 / 工坊建材的素材繳交進度</li>
    <li>剩餘素材一鍵推進購物清單（Tracker → BOM 單向同步）</li>
    <li>支援整艘潛水艇 / 飛空艇的 4 零件 bundle 專案</li>
    <li>每個 phase 的 supplyItem 都有獨立進度 counter</li>
  </ul>
</section>
```

- [ ] **Step 3: Run lint + type-check**

```bash
npm run lint
npm run type-check
```

Both should pass.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/company-craft/PhaseRow.vue src/components/company-craft/SupplyItemCounter.vue src/components/company-craft/PhaseBoard.vue src/views/ChangelogView.vue
git commit -m "polish(workshop): a11y labels + v2.15.0 changelog entry"
```

---

## Self-Review notes (incorporated)

- **Spec §3.1 type column for Level** — addressed in Task 2 Step 1 with fallback `pickHeader` for level column.
- **Spec §4.3 reactive sync** — addressed in Task 8 with `linkedProjectSig` watcher + ElMessage toast.
- **Spec §4.4 sync button label state** — addressed in Task 12 (`isLinkedToBom` computed driving label text).
- **Spec §4.4 single-direction rationale** — BOM never writes back to project; ensured by not adding any `bom → workshopStore` writes.
- **Spec §5 testing strategy** — covered: build-game-data unit (Task 1), workshop-projects unit (Tasks 4–5), bom-calculator (Task 7), PhaseBoard smoke (Task 19), NewProjectDialog smoke (Task 23). E2e explicitly skipped per spec.
- **Spec §4.4 quick actions** — 全部繳清 + 標記下一階段 implemented in Tasks 14–15.
- **Spec §4.4 phase board parts strip** — only renders for non-workshop categories (Task 13 template guard).
- **Spec §4.2 selectors** — getDelivered / isPhaseComplete / getRemainingMaterials / getTotalMaterials / getProjectProgress all implemented and tested (Tasks 4–5).
- **Spec §4.3 BomTarget migration** — `migrateLegacyTarget` in Task 6 handles legacy `recipeId: null | number` shape.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-13-company-craft-picker.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
