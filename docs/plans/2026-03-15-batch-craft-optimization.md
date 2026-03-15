# Batch Craft Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Batch Craft" view that lets users queue multiple recipes, auto-solve + HQ-optimize all at once, and get a grouped shopping list + ordered todo list with macros.

**Architecture:** New `batch` Pinia store holds the queue and results. A `batch-optimizer` service orchestrates per-recipe solving → HQ optimization → material aggregation → price querying. The `BatchView` renders results in tabs (shopping list / todo / exceptions). Settings store extended with cross-server + recursive pricing + exception strategy.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, Vitest, existing WASM solver worker, Universalis API, XIVAPI.

**Spec:** `docs/to_buy_list_optimization_v2.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/stores/batch.ts` | Batch queue (targets + quantities), results, progress, exceptions state |
| `src/services/batch-optimizer.ts` | Orchestration engine: solve → HQ optimize → aggregate → price query |
| `src/services/shopping-list.ts` | Cross-server grouping logic: assign materials to cheapest server |
| `src/services/macro-formatter.ts` | Extract macro formatting from MacroExport.vue into reusable pure function |
| `src/views/BatchView.vue` | Page layout: batch list + settings + results tabs |
| `src/components/batch/BatchList.vue` | Table of queued recipes with quantity editing |
| `src/components/batch/BatchSettings.vue` | Toggles for recursive/cross-server/exception strategy |
| `src/components/batch/BatchProgress.vue` | Progress bar during calculation |
| `src/components/batch/ShoppingList.vue` | Crystal summary + server-grouped material tables |
| `src/components/batch/TodoList.vue` | Ordered checklist with macro expansion |
| `src/components/batch/ExceptionList.vue` | Notification cards for skipped/bought exceptions |

### Modified Files

| File | Change |
|------|--------|
| `src/stores/settings.ts` | Add `crossServer`, `recursivePricing`, `maxRecursionDepth`, `exceptionStrategy` |
| `src/router/index.ts` | Add `/batch` route |
| `src/App.vue` | Add "批量製作" sidebar menu item |
| `src/views/RecipeView.vue` | Add "加入批量" button |
| `src/solver/worker.ts` | Extract `craftParamsToSolverConfig` to shared util (currently duplicated in 2 files) |

### Test Files

| File | Tests |
|------|-------|
| `src/__tests__/stores/batch.test.ts` | Batch store CRUD, persistence |
| `src/__tests__/services/batch-optimizer.test.ts` | Orchestration logic with mocked solver/API |
| `src/__tests__/services/shopping-list.test.ts` | Cross-server grouping, crystal separation |
| `src/__tests__/services/macro-formatter.test.ts` | Macro text generation |

---

## Chunk 1: Foundation — Store + Settings + Routing

### Task 1: Extend Settings Store

**Files:**
- Modify: `src/stores/settings.ts`
- Test: `src/__tests__/stores/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// In src/__tests__/stores/settings.test.ts — add new describe block
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('batch settings', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('has default batch settings', () => {
    const store = useSettingsStore()
    expect(store.crossServer).toBe(false)
    expect(store.recursivePricing).toBe(true)
    expect(store.maxRecursionDepth).toBe(3)
    expect(store.exceptionStrategy).toBe('skip')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/stores/settings.test.ts`
Expected: FAIL — `crossServer` property does not exist

- [ ] **Step 3: Implement — add batch settings to store**

```typescript
// Add to src/stores/settings.ts refs:
const crossServer = ref(false)
const recursivePricing = ref(true)
const maxRecursionDepth = ref(3)
const exceptionStrategy = ref<'skip' | 'buy'>('skip')
```

Return all four from the store's `return` statement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/stores/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/settings.ts src/__tests__/stores/settings.test.ts
git commit -m "feat(settings): add batch craft settings (crossServer, recursivePricing, exceptionStrategy)"
```

---

### Task 2: Create Batch Store

**Files:**
- Create: `src/stores/batch.ts`
- Test: `src/__tests__/stores/batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/stores/batch.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBatchStore } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'

const mockRecipe: Recipe = {
  id: 100,
  itemId: 200,
  name: '探究者之鋸',
  icon: '/icon.png',
  job: 'CRP',
  level: 100,
  stars: 2,
  canHq: true,
  materialQualityFactor: 75,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 100, stars: 2, difficulty: 6600, quality: 14040,
    durability: 70, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 80, qualityModifier: 70,
  },
}

describe('useBatchStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('adds a target with default quantity 1', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    expect(store.targets).toHaveLength(1)
    expect(store.targets[0].recipe.id).toBe(100)
    expect(store.targets[0].quantity).toBe(1)
  })

  it('merges quantity when adding duplicate recipe', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.addTarget(mockRecipe)
    expect(store.targets).toHaveLength(1)
    expect(store.targets[0].quantity).toBe(2)
  })

  it('removes a target', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.removeTarget(100)
    expect(store.targets).toHaveLength(0)
  })

  it('updates quantity', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.updateQuantity(100, 5)
    expect(store.targets[0].quantity).toBe(5)
  })

  it('clears all targets', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.clearTargets()
    expect(store.targets).toHaveLength(0)
  })

  it('tracks running state and progress', () => {
    const store = useBatchStore()
    expect(store.isRunning).toBe(false)
    expect(store.progress).toEqual({ current: 0, total: 0, currentName: '' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/stores/batch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement batch store**

```typescript
// src/stores/batch.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Recipe } from '@/stores/recipe'

export interface BatchTarget {
  recipe: Recipe
  quantity: number
}

export interface BatchException {
  type: 'level-insufficient' | 'quality-unachievable'
  recipe: Recipe
  message: string
  details: string
  action: 'skipped' | 'buy-finished'
  buyPrice?: number
  buyServer?: string
}

export interface BatchRecipeResult {
  recipe: Recipe
  quantity: number
  actions: string[]          // solver result actions
  hqAmounts: number[]        // per-ingredient HQ counts (empty if double-max)
  initialQuality: number
  isDoubleMax: boolean
}

// Re-export types from shopping-list service
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary } from '@/services/shopping-list'
export type { ShoppingItem, ServerGroup, CrystalSummary }

export interface TodoItem {
  recipe: Recipe
  quantity: number
  actions: string[]
  hqAmounts: number[]
  isSemiFinished: boolean
  done: boolean
}

export interface BatchResults {
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftItems: ShoppingItem[]
  todoList: TodoItem[]
  exceptions: BatchException[]
  grandTotal: number
}

export const useBatchStore = defineStore('batch', () => {
  const targets = ref<BatchTarget[]>([])
  const isRunning = ref(false)
  const isCancelled = ref(false)
  const progress = ref({ current: 0, total: 0, currentName: '' })
  const results = ref<BatchResults | null>(null)

  function addTarget(recipe: Recipe) {
    const existing = targets.value.find(t => t.recipe.id === recipe.id)
    if (existing) {
      existing.quantity += 1
    } else {
      targets.value.push({ recipe, quantity: 1 })
    }
  }

  function removeTarget(recipeId: number) {
    targets.value = targets.value.filter(t => t.recipe.id !== recipeId)
  }

  function updateQuantity(recipeId: number, quantity: number) {
    const target = targets.value.find(t => t.recipe.id === recipeId)
    if (target) target.quantity = quantity
  }

  function clearTargets() {
    targets.value = []
  }

  function clearResults() {
    results.value = null
  }

  function cancel() {
    isCancelled.value = true
  }

  return {
    targets,
    isRunning,
    isCancelled,
    progress,
    results,
    addTarget,
    removeTarget,
    updateQuantity,
    clearTargets,
    clearResults,
    cancel,
  }
}, {
  persist: {
    pick: ['targets'],
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/stores/batch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/batch.ts src/__tests__/stores/batch.test.ts
git commit -m "feat(store): add batch store for batch craft queue and results"
```

---

### Task 3: Add Route + Sidebar Entry

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Add `/batch` route**

In `src/router/index.ts`, add between `/bom` and `/market`:

```typescript
{
  path: '/batch',
  name: 'batch',
  component: () => import('@/views/BatchView.vue'),
},
```

- [ ] **Step 2: Add sidebar item in `src/App.vue`**

Add between 材料清單 and 市場查價 menu items:

```html
<el-menu-item index="/batch">
  <el-icon><Operation /></el-icon>
  <span>批量製作</span>
</el-menu-item>
```

Import `Operation` from `@element-plus/icons-vue` in the script section.

- [ ] **Step 3: Create minimal BatchView placeholder**

```vue
<!-- src/views/BatchView.vue -->
<script setup lang="ts">
</script>

<template>
  <div class="batch-view">
    <h2>批量製作</h2>
    <p>（開發中）</p>
  </div>
</template>
```

- [ ] **Step 4: Verify — start dev server, navigate to /batch**

Run: `npx vite dev`
Verify: sidebar shows "批量製作", clicking navigates to `/batch` and shows placeholder.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/App.vue src/views/BatchView.vue
git commit -m "feat(routing): add batch craft view route and sidebar entry"
```

---

### Task 4: Add "加入批量" Button to RecipeView

**Files:**
- Modify: `src/views/RecipeView.vue`

- [ ] **Step 1: Import batch store and add handler**

In `<script setup>`, add:

```typescript
import { useBatchStore } from '@/stores/batch'
import { ElMessage } from 'element-plus'

const batchStore = useBatchStore()

function handleAddToBatch() {
  if (!selectedRecipe.value) return
  batchStore.addTarget(selectedRecipe.value)
  ElMessage.success(`已加入批量：${selectedRecipe.value.name}`)
}
```

- [ ] **Step 2: Add button in template**

Add next to existing "加入材料清單" button:

```html
<el-button type="warning" @click="handleAddToBatch" :disabled="!selectedRecipe">
  加入批量
</el-button>
```

- [ ] **Step 3: Verify — select a recipe, click "加入批量"**

Run dev server. Select a recipe → click "加入批量" → success toast appears.
Navigate to `/batch` → (later will show the target in batch list).

- [ ] **Step 4: Commit**

```bash
git add src/views/RecipeView.vue
git commit -m "feat(recipe): add 'add to batch' button in recipe view"
```

---

## Chunk 2: Service Layer — Macro Formatter + Shopping List + Batch Optimizer

### Task 5: Extract Macro Formatter

**Files:**
- Create: `src/services/macro-formatter.ts`
- Test: `src/__tests__/services/macro-formatter.test.ts`
- Modify: `src/components/simulator/MacroExport.vue` (use extracted function)

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/services/macro-formatter.test.ts
import { describe, it, expect } from 'vitest'
import { formatMacros } from '@/services/macro-formatter'

describe('formatMacros', () => {
  it('converts action IDs to macro lines', () => {
    const result = formatMacros(['muscle_memory', 'veneration', 'groundwork'])
    expect(result).toHaveLength(1) // fits in one macro
    expect(result[0]).toContain('/ac')
    expect(result[0]).toContain('<wait.')
  })

  it('splits into multiple macros when exceeding line limit', () => {
    // 20 actions should split into 2 macros (15 lines each, minus echo)
    const actions = Array(20).fill('groundwork')
    const result = formatMacros(actions)
    expect(result.length).toBeGreaterThan(1)
  })

  it('returns empty array for no actions', () => {
    expect(formatMacros([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/macro-formatter.test.ts`

- [ ] **Step 3: Implement macro-formatter**

```typescript
// src/services/macro-formatter.ts
import { getSkillById } from '@/engine/skills'

const MACRO_LINE_LIMIT = 15
const BUFF_CATEGORIES = new Set(['buff', 'other'])

interface FormatOptions {
  waitTime?: number
  includeEcho?: boolean
}

function getWaitTime(skillId: string, defaultWait: number): number {
  const skill = getSkillById(skillId)
  if (skill && BUFF_CATEGORIES.has(skill.category)) {
    return Math.min(defaultWait, 2)
  }
  return defaultWait
}

function formatAction(skillId: string, waitTime: number): string {
  const skill = getSkillById(skillId)
  const name = skill?.nameZh ?? skillId
  return `/ac ${name} <wait.${getWaitTime(skillId, waitTime)}>`
}

export function formatMacros(
  actions: string[],
  options: FormatOptions = {},
): string[] {
  if (actions.length === 0) return []

  const { waitTime = 3, includeEcho = true } = options
  const lines = actions.map(a => formatAction(a, waitTime))
  const result: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    const limit = includeEcho ? MACRO_LINE_LIMIT - 1 : MACRO_LINE_LIMIT
    if (current.length >= limit) {
      result.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) result.push(current)

  return result.map((chunk, i) => {
    const macroLines = [...chunk]
    if (includeEcho) {
      macroLines.push(`/echo 巨集 ${i + 1} 完成 <se.1>`)
    }
    return macroLines.join('\n')
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/macro-formatter.test.ts`

- [ ] **Step 5: Refactor MacroExport.vue to use extracted function**

In `src/components/simulator/MacroExport.vue`, replace the inline `formatAction` and `macros` computed with:

```typescript
import { formatMacros } from '@/services/macro-formatter'

const macros = computed(() =>
  formatMacros(simStore.actions, {
    waitTime: waitTime.value,
    includeEcho: includeEcho.value,
  })
)
```

Remove the old `formatAction`, `getWaitTime`, `MACRO_LINE_LIMIT`, `BUFF_CATEGORIES` from the component.

- [ ] **Step 6: Verify existing macro export still works**

Run dev server → Simulator → verify macro output unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/services/macro-formatter.ts src/__tests__/services/macro-formatter.test.ts src/components/simulator/MacroExport.vue
git commit -m "refactor(macro): extract macro formatting into reusable service"
```

---

### Task 6: Extract `craftParamsToSolverConfig` to Shared Util

**Files:**
- Create: `src/solver/config.ts`
- Modify: `src/views/SimulatorView.vue`
- Modify: `src/components/simulator/CraftRecommendation.vue`

Currently `craftParamsToSolverConfig` is duplicated in both files. Extract to shared location.

- [ ] **Step 1: Create shared util**

```typescript
// src/solver/config.ts
import type { CraftParams } from '@/engine/simulator'
import type { SolverConfig } from '@/solver/raphael'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

export function craftParamsToSolverConfig(params: CraftParams): SolverConfig {
  return {
    recipe_level: params.recipeLevelTable.classJobLevel,
    stars: params.recipeLevelTable.stars,
    progress: params.recipeLevelTable.difficulty,
    quality: params.recipeLevelTable.quality,
    durability: params.recipeLevelTable.durability,
    cp: params.cp,
    craftsmanship: params.craftsmanship,
    control: params.control,
    crafter_level: params.crafterLevel,
    progress_divider: params.recipeLevelTable.progressDivider,
    quality_divider: params.recipeLevelTable.qualityDivider,
    progress_modifier: params.recipeLevelTable.progressModifier,
    quality_modifier: params.recipeLevelTable.qualityModifier,
    hq_target: params.canHq,
    initial_quality: params.initialQuality,
    use_manipulation: true,
    use_heart_and_soul: true,
    use_quick_innovation: true,
    use_trained_eye: true,
  }
}

export function recipeToCraftParams(recipe: Recipe, gearset: GearsetStats): CraftParams {
  return {
    craftsmanship: gearset.craftsmanship,
    control: gearset.control,
    cp: gearset.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality: 0,
  }
}
```

- [ ] **Step 2: Update SimulatorView.vue — import from shared**

Replace the local `craftParamsToSolverConfig` with import from `@/solver/config`.

- [ ] **Step 3: Update CraftRecommendation.vue — import from shared**

Replace the local `craftParamsToSolverConfig` with import from `@/solver/config`.

- [ ] **Step 4: Verify simulator still works**

Run dev server → test simulation → confirm unchanged behavior.

- [ ] **Step 5: Commit**

```bash
git add src/solver/config.ts src/views/SimulatorView.vue src/components/simulator/CraftRecommendation.vue
git commit -m "refactor(solver): extract craftParamsToSolverConfig to shared util"
```

---

### Task 7: Shopping List Service

**Files:**
- Create: `src/services/shopping-list.ts`
- Test: `src/__tests__/services/shopping-list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/services/shopping-list.test.ts
import { describe, it, expect } from 'vitest'
import {
  separateCrystals,
  groupByServer,
  type MaterialWithPrice,
} from '@/services/shopping-list'

describe('separateCrystals', () => {
  it('separates items with itemId < 20 as crystals', () => {
    const materials = [
      { itemId: 2, name: '火之水晶', icon: '', amount: 30 },
      { itemId: 100, name: '完全木材', icon: '', amount: 5 },
      { itemId: 8, name: '風之碎晶', icon: '', amount: 20 },
    ]
    const { crystals, nonCrystals } = separateCrystals(materials)
    expect(crystals).toHaveLength(2)
    expect(nonCrystals).toHaveLength(1)
    expect(nonCrystals[0].name).toBe('完全木材')
  })
})

describe('groupByServer', () => {
  it('groups materials by their cheapest server', () => {
    const materials: MaterialWithPrice[] = [
      { itemId: 100, name: 'A', icon: '', amount: 5, type: 'nq', unitPrice: 1000, server: 'Chocobo' },
      { itemId: 200, name: 'B', icon: '', amount: 3, type: 'hq', unitPrice: 2000, server: 'Tonberry' },
      { itemId: 300, name: 'C', icon: '', amount: 2, type: 'nq', unitPrice: 500, server: 'Chocobo' },
    ]
    const groups = groupByServer(materials)
    expect(groups).toHaveLength(2)

    const chocobo = groups.find(g => g.server === 'Chocobo')!
    expect(chocobo.items).toHaveLength(2)
    expect(chocobo.subtotal).toBe(5 * 1000 + 2 * 500)

    const tonberry = groups.find(g => g.server === 'Tonberry')!
    expect(tonberry.items).toHaveLength(1)
    expect(tonberry.subtotal).toBe(3 * 2000)
  })

  it('returns single group when all from same server', () => {
    const materials: MaterialWithPrice[] = [
      { itemId: 100, name: 'A', icon: '', amount: 5, type: 'nq', unitPrice: 1000, server: 'Chocobo' },
    ]
    const groups = groupByServer(materials)
    expect(groups).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/shopping-list.test.ts`

- [ ] **Step 3: Implement shopping-list service**

```typescript
// src/services/shopping-list.ts
export interface MaterialBase {
  itemId: number
  name: string
  icon: string
  amount: number
}

export interface MaterialWithPrice extends MaterialBase {
  type: 'nq' | 'hq' | 'craft'
  unitPrice: number
  server?: string
}

export interface CrystalSummary {
  itemId: number
  name: string
  amount: number
}

export interface ServerGroup {
  server: string
  items: MaterialWithPrice[]
  subtotal: number
}

const CRYSTAL_THRESHOLD = 20

export function separateCrystals(materials: MaterialBase[]): {
  crystals: CrystalSummary[]
  nonCrystals: MaterialBase[]
} {
  const crystals: CrystalSummary[] = []
  const nonCrystals: MaterialBase[] = []

  for (const m of materials) {
    if (m.itemId < CRYSTAL_THRESHOLD) {
      crystals.push({ itemId: m.itemId, name: m.name, amount: m.amount })
    } else {
      nonCrystals.push(m)
    }
  }
  return { crystals, nonCrystals }
}

export function groupByServer(materials: MaterialWithPrice[]): ServerGroup[] {
  const groups = new Map<string, MaterialWithPrice[]>()

  for (const m of materials) {
    const server = m.server ?? 'Unknown'
    if (!groups.has(server)) groups.set(server, [])
    groups.get(server)!.push(m)
  }

  return Array.from(groups.entries()).map(([server, items]) => ({
    server,
    items,
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.amount, 0),
  }))
}

export function aggregateMaterials(
  materialsArrays: MaterialBase[][],
): MaterialBase[] {
  const map = new Map<number, MaterialBase>()
  for (const materials of materialsArrays) {
    for (const m of materials) {
      const existing = map.get(m.itemId)
      if (existing) {
        existing.amount += m.amount
      } else {
        map.set(m.itemId, { ...m })
      }
    }
  }
  return Array.from(map.values())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/shopping-list.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/shopping-list.ts src/__tests__/services/shopping-list.test.ts
git commit -m "feat(service): add shopping list service with crystal separation and server grouping"
```

---

### Task 8: Batch Optimizer Service

**Files:**
- Create: `src/services/batch-optimizer.ts`
- Test: `src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/services/batch-optimizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SimulateResult } from '@/solver/raphael'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
  getMarketData: vi.fn().mockResolvedValue({ minPriceNQ: 5000 }),
  getMarketDataByDC: vi.fn().mockResolvedValue({ listings: [] }),
}))
vi.mock('@/services/bom-calculator', () => ({
  buildMaterialTree: vi.fn().mockResolvedValue([]),
  flattenMaterialTree: vi.fn().mockReturnValue([]),
  getCraftingOrder: vi.fn().mockReturnValue([]),
}))

import { optimizeRecipe, runBatchOptimization } from '@/services/batch-optimizer'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { getMarketData } from '@/api/universalis'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75,
  ingredients: [
    { itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 },
    { itemId: 201, name: 'Mat B', icon: '', amount: 2, canHq: false, level: 50 },
  ],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}
const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600 }

const doubleMaxSim: Partial<SimulateResult> = {
  progress: 3500, max_progress: 3500,
  quality: 7200, max_quality: 7200,
  durability: 10, max_durability: 80, cp: 100, max_cp: 600, steps_count: 2,
}
const qualityDeficitSim: Partial<SimulateResult> = {
  progress: 3500, max_progress: 3500,
  quality: 5000, max_quality: 7200,
  durability: 10, max_durability: 80, cp: 100, max_cp: 600, steps_count: 1,
}

describe('optimizeRecipe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns double-max result when solver achieves full quality', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'] })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as SimulateResult)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(true)
    expect(result.hqAmounts).toEqual([])
  })

  it('returns hq combo when quality deficit exists', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'] })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as SimulateResult)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(false)
    expect(result.hqAmounts.length).toBe(2)
  })
})

describe('runBatchOptimization', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultSettings = {
    crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
    exceptionStrategy: 'skip' as const, server: 'Chocobo', dataCenter: 'Mana',
  }

  it('creates level-insufficient exception when gearset too low', async () => {
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300 }
    const { exceptions } = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(exceptions).toHaveLength(1)
    expect(exceptions[0].type).toBe('level-insufficient')
    expect(exceptions[0].action).toBe('skipped')
  })

  it('queries buy price when exception strategy is buy', async () => {
    vi.mocked(getMarketData).mockResolvedValue({ minPriceNQ: 12000, minPriceHQ: 15000 } as any)
    const { exceptions } = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => ({ level: 50, craftsmanship: 1000, control: 1000, cp: 300 }),
      { ...defaultSettings, exceptionStrategy: 'buy' },
      () => {}, () => false,
    )
    expect(exceptions[0].action).toBe('buy-finished')
    expect(exceptions[0].buyPrice).toBe(12000)
  })

  it('respects cancellation', async () => {
    let cancelled = false
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['groundwork'] })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as SimulateResult)

    const { recipeResults } = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }, { recipe: { ...mockRecipe, id: 2 }, quantity: 1 }],
      () => mockGearset,
      defaultSettings,
      (current) => { if (current >= 1) cancelled = true },
      () => cancelled,
    )
    expect(recipeResults.length).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 3: Implement batch-optimizer service**

```typescript
// src/services/batch-optimizer.ts
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { BatchException, BatchTarget, BatchResults, TodoItem, ShoppingItem } from '@/stores/batch'
import { solveCraft, simulateCraft, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import { findOptimalHqCombinations } from '@/services/hq-optimizer'
import { getAggregatedPrices, getMarketData, aggregateByWorld } from '@/api/universalis'
import { separateCrystals, groupByServer, aggregateMaterials, type MaterialWithPrice, type MaterialBase } from '@/services/shopping-list'
import { buildMaterialTree, flattenMaterialTree, getCraftingOrder, computeOptimalCosts } from '@/services/bom-calculator'

export interface RecipeOptimizeResult {
  recipe: Recipe
  quantity: number
  actions: string[]
  hqAmounts: number[]       // per-ingredient HQ counts (empty = all NQ)
  initialQuality: number
  isDoubleMax: boolean
  materials: MaterialBase[]  // direct ingredients
}

export async function optimizeRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
): Promise<RecipeOptimizeResult> {
  await waitForWasm()

  const craftParams = recipeToCraftParams(recipe, gearset)
  const solverConfig = craftParamsToSolverConfig(craftParams)
  const solverResult = await solveCraft(solverConfig)
  const simResult = await simulateCraft(solverConfig, solverResult.actions)

  const isDoubleMax =
    simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality

  const materials = recipe.ingredients.map(i => ({
    itemId: i.itemId, name: i.name, icon: i.icon, amount: i.amount,
  }))

  if (isDoubleMax) {
    return {
      recipe, quantity: 1, actions: solverResult.actions,
      hqAmounts: [], initialQuality: 0, isDoubleMax: true, materials,
    }
  }

  const qualityDeficit = simResult.max_quality - simResult.quality
  const combos = findOptimalHqCombinations(
    recipe.recipeLevelTable.quality,
    recipe.materialQualityFactor,
    recipe.ingredients,
    qualityDeficit,
    new Map(),
  )
  const bestCombo = combos[0]

  return {
    recipe, quantity: 1, actions: solverResult.actions,
    hqAmounts: bestCombo?.hqAmounts ?? [],
    initialQuality: bestCombo?.initialQuality ?? 0,
    isDoubleMax: false, materials,
  }
}

/** Full batch pipeline: solve → HQ optimize → aggregate → price → group → todo */
export async function runBatchOptimization(
  targets: BatchTarget[],
  getGearset: (job: string) => (GearsetStats & { job: string }) | GearsetStats | null,
  settings: {
    crossServer: boolean
    recursivePricing: boolean
    maxRecursionDepth: number
    exceptionStrategy: 'skip' | 'buy'
    server: string
    dataCenter: string
  },
  onProgress: (current: number, total: number, name: string) => void,
  isCancelled: () => boolean,
): Promise<BatchResults> {
  const recipeResults: RecipeOptimizeResult[] = []
  const exceptions: BatchException[] = []

  await waitForWasm()

  // === Phase 1-3: Per-recipe solve + HQ optimize ===
  for (let i = 0; i < targets.length; i++) {
    if (isCancelled()) break
    const target = targets[i]
    onProgress(i + 1, targets.length, target.recipe.name)

    const gearset = getGearset(target.recipe.job)
    if (!gearset || gearset.level < target.recipe.level) {
      const exc: BatchException = {
        type: 'level-insufficient',
        recipe: target.recipe,
        message: '職業等級不足',
        details: `你的 ${target.recipe.job} 等級 ${gearset?.level ?? 0} 不足以製作「${target.recipe.name}」（需要等級 ${target.recipe.level}）`,
        action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
      }
      if (settings.exceptionStrategy === 'buy') {
        try {
          const md = await getMarketData(settings.server, target.recipe.itemId)
          exc.buyPrice = md.minPriceNQ
          exc.buyServer = settings.server
        } catch { /* ignore — buyPrice stays undefined */ }
      }
      exceptions.push(exc)
      continue
    }

    try {
      const result = await optimizeRecipe(target.recipe, gearset)
      result.quantity = target.quantity

      if (!result.isDoubleMax && result.hqAmounts.length === 0) {
        const exc: BatchException = {
          type: 'quality-unachievable',
          recipe: target.recipe,
          message: '無法達成雙滿',
          details: `「${target.recipe.name}」即使使用全部 HQ 素材仍無法達成品質上限`,
          action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
        }
        if (settings.exceptionStrategy === 'buy') {
          try {
            const md = await getMarketData(settings.server, target.recipe.itemId)
            exc.buyPrice = md.minPriceNQ
            exc.buyServer = settings.server
          } catch { /* ignore */ }
        }
        exceptions.push(exc)
        continue
      }
      recipeResults.push(result)
    } catch (err) {
      exceptions.push({
        type: 'quality-unachievable', recipe: target.recipe,
        message: '計算失敗', details: `「${target.recipe.name}」計算過程發生錯誤：${err}`,
        action: 'skipped',
      })
    }
  }

  // === Phase 4: Recursive BOM expansion + HQ/NQ aggregation ===
  // Use typed materials to keep HQ/NQ separate (composite key: itemId + type)
  interface TypedMaterial extends MaterialBase {
    matType: 'hq' | 'nq'
  }

  const allTypedMaterials: TypedMaterial[] = []
  const selfCraftItems: ShoppingItem[] = []
  const semiFinishedTodos: TodoItem[] = []

  for (const r of recipeResults) {
    for (let j = 0; j < r.materials.length; j++) {
      const m = r.materials[j]
      const hqCount = r.hqAmounts[j] ?? 0
      const nqCount = m.amount - hqCount
      if (hqCount > 0) {
        allTypedMaterials.push({ ...m, amount: hqCount * r.quantity, matType: 'hq' })
      }
      if (nqCount > 0) {
        allTypedMaterials.push({ ...m, amount: nqCount * r.quantity, matType: 'nq' })
      }
    }
  }

  // Aggregate using composite key (itemId + matType) to avoid HQ/NQ collision
  const matMap = new Map<string, TypedMaterial>()
  for (const m of allTypedMaterials) {
    const key = `${m.itemId}-${m.matType}`
    const existing = matMap.get(key)
    if (existing) {
      existing.amount += m.amount
    } else {
      matMap.set(key, { ...m })
    }
  }
  const aggregated = Array.from(matMap.values())
  const { crystals, nonCrystals } = separateCrystals(aggregated)

  // Recursive BOM: expand craftable materials and compare buy vs craft cost
  if (settings.recursivePricing) {
    const bomTargets = nonCrystals.map(m => ({
      itemId: m.itemId, recipeId: 0, name: m.name, icon: m.icon, quantity: m.amount,
    }))
    try {
      const tree = await buildMaterialTree(bomTargets)
      const flatList = flattenMaterialTree(tree)
      const priceMap = await getAggregatedPrices(settings.server, flatList.map(f => f.itemId))
      const costResult = computeOptimalCosts(tree, (id) => {
        const md = priceMap.get(id)
        return md?.minPriceNQ ?? 0
      })
      // Add self-craft decisions to todo list (placeholder — solver per sub-recipe is v2)
      for (const decision of costResult.decisions) {
        if (decision.recommendation === 'craft') {
          selfCraftItems.push({
            itemId: decision.itemId, name: decision.name, icon: decision.icon,
            amount: decision.amount, type: 'craft', unitPrice: 0,
          })
        }
      }
    } catch (err) {
      console.warn('[batch-optimizer] Recursive BOM expansion failed, falling back to direct materials:', err)
    }
  }

  // === Phase 5: Price query + cross-server grouping ===
  const itemIds = nonCrystals.map(m => m.itemId)
  let pricedMaterials: MaterialWithPrice[]

  if (settings.crossServer) {
    const dcPriceMap = await getAggregatedPrices(settings.dataCenter, itemIds)
    pricedMaterials = nonCrystals.map(m => {
      const md = dcPriceMap.get(m.itemId)
      const isHq = (m as any).matType === 'hq'
      let cheapestServer = settings.server
      let cheapestPrice = isHq ? (md?.minPriceHQ ?? 0) : (md?.minPriceNQ ?? 0)
      if (md?.listings) {
        const worldSummaries = aggregateByWorld(md.listings)
        for (const ws of worldSummaries) {
          const price = isHq ? ws.minPriceHQ : ws.minPriceNQ
          if (price > 0 && price < cheapestPrice) {
            cheapestPrice = price
            cheapestServer = ws.worldName
          }
        }
      }
      return {
        itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
        type: isHq ? 'hq' as const : 'nq' as const,
        unitPrice: cheapestPrice, server: cheapestServer,
      }
    })
  } else {
    const priceMap = await getAggregatedPrices(settings.server, itemIds)
    pricedMaterials = nonCrystals.map(m => {
      const md = priceMap.get(m.itemId)
      const isHq = (m as any).matType === 'hq'
      return {
        itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
        type: isHq ? 'hq' as const : 'nq' as const,
        unitPrice: isHq ? (md?.minPriceHQ ?? 0) : (md?.minPriceNQ ?? 0),
        server: settings.server,
      }
    })
  }

  const serverGroups = groupByServer(pricedMaterials)
  const grandTotal = serverGroups.reduce((sum, g) => sum + g.subtotal, 0)

  // === Phase 6: Todo list with topological sort ===
  // Top-level recipe crafts
  const topLevelTodos: TodoItem[] = recipeResults.map(r => ({
    recipe: r.recipe, quantity: r.quantity, actions: r.actions,
    hqAmounts: r.hqAmounts, isSemiFinished: false, done: false,
  }))
  // Semi-finished first, then top-level (topological: dependencies before dependents)
  const todoList: TodoItem[] = [...semiFinishedTodos, ...topLevelTodos]

  return { serverGroups, crystals, selfCraftItems, todoList, exceptions, grandTotal }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(service): add batch optimizer with full pipeline (HQ/NQ distinction, cross-server, buy-finished)"
```

---

## Chunk 3: UI Components

### Task 9: BatchList Component

**Files:**
- Create: `src/components/batch/BatchList.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/BatchList.vue -->
<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { JOB_NAMES } from '@/utils/jobs'

const batchStore = useBatchStore()

function getJobName(abbr: string): string {
  return JOB_NAMES[abbr] ?? abbr
}

function starsDisplay(stars: number): string {
  return stars > 0 ? '★'.repeat(stars) : ''
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>製作清單</span>
        <el-text type="info" size="small">{{ batchStore.targets.length }} 個配方</el-text>
      </div>
    </template>

    <el-table :data="batchStore.targets" v-if="batchStore.targets.length > 0">
      <el-table-column label="" width="50">
        <template #default="{ row }">
          <img v-if="row.recipe.icon" :src="row.recipe.icon" style="width:24px;height:24px;border-radius:4px;" />
        </template>
      </el-table-column>
      <el-table-column label="配方名稱" prop="recipe.name" />
      <el-table-column label="數量" width="100">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.quantity"
            @update:model-value="(v: number) => batchStore.updateQuantity(row.recipe.id, v)"
            :min="1"
            :max="99"
            size="small"
            controls-position="right"
          />
        </template>
      </el-table-column>
      <el-table-column label="職業" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="primary">{{ getJobName(row.recipe.job) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等級" width="120">
        <template #default="{ row }">
          Lv.{{ row.recipe.recipeLevelTable.classJobLevel }} {{ starsDisplay(row.recipe.stars) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-button type="danger" text size="small" @click="batchStore.removeTarget(row.recipe.id)">
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="尚未加入任何配方，請至「配方搜尋」頁面新增" />
  </el-card>
</template>
```

- [ ] **Step 2: Verify — render in BatchView**

Temporarily import and render `<BatchList />` in `BatchView.vue`. Add a recipe from RecipeView, navigate to `/batch`, verify it appears.

- [ ] **Step 3: Commit**

```bash
git add src/components/batch/BatchList.vue
git commit -m "feat(ui): add BatchList component with quantity editing and removal"
```

---

### Task 10: BatchSettings Component

**Files:**
- Create: `src/components/batch/BatchSettings.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/BatchSettings.vue -->
<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <el-card shadow="never">
    <template #header>計算設定</template>
    <div style="display: flex; gap: 32px; flex-wrap: wrap;">
      <div>
        <el-switch v-model="settings.recursivePricing" active-text="遞迴查價（半成品）" />
        <div v-if="settings.recursivePricing" style="margin-left: 50px; margin-top: 8px;">
          <el-text size="small" type="info">最大遞迴深度：</el-text>
          <el-input-number v-model="settings.maxRecursionDepth" :min="1" :max="10" size="small" style="width:80px;" />
        </div>
      </div>
      <div>
        <el-switch v-model="settings.crossServer" active-text="跨服採購" />
        <div v-if="settings.crossServer" style="margin-left: 50px; margin-top: 4px;">
          <el-text size="small" type="info">查詢 {{ settings.dataCenter }} 全伺服器最低價</el-text>
        </div>
      </div>
      <div>
        <el-text size="small" style="display: block; margin-bottom: 6px;">例外處理策略</el-text>
        <el-radio-group v-model="settings.exceptionStrategy" size="small">
          <el-radio-button value="skip">跳過</el-radio-button>
          <el-radio-button value="buy">套用購買價</el-radio-button>
        </el-radio-group>
        <div style="margin-top: 4px;">
          <el-text size="small" type="info">等級不足或無法雙滿時的處理方式</el-text>
        </div>
      </div>
    </div>
  </el-card>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/BatchSettings.vue
git commit -m "feat(ui): add BatchSettings component with recursive/cross-server/exception toggles"
```

---

### Task 11: BatchProgress Component

**Files:**
- Create: `src/components/batch/BatchProgress.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/BatchProgress.vue -->
<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const percentage = computed(() => {
  if (batchStore.progress.total === 0) return 0
  return Math.round((batchStore.progress.current / batchStore.progress.total) * 100)
})
</script>

<template>
  <el-card shadow="never" v-if="batchStore.isRunning">
    <template #header>計算進度</template>
    <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <el-text size="small" type="info">
          正在計算：<strong>{{ batchStore.progress.currentName }}</strong>
        </el-text>
        <el-text size="small" type="info">
          {{ batchStore.progress.current }} / {{ batchStore.progress.total }}
        </el-text>
      </div>
      <el-progress :percentage="percentage" :stroke-width="8" />
      <div style="text-align: right; margin-top: 8px;">
        <el-button size="small" @click="batchStore.cancel()">取消</el-button>
      </div>
    </div>
  </el-card>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/BatchProgress.vue
git commit -m "feat(ui): add BatchProgress component with cancel support"
```

---

### Task 12: ShoppingList Component

**Files:**
- Create: `src/components/batch/ShoppingList.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/ShoppingList.vue -->
<script setup lang="ts">
import type { CrystalSummary, ServerGroup, ShoppingItem } from '@/stores/batch'

defineProps<{
  crystals: CrystalSummary[]
  serverGroups: ServerGroup[]
  selfCraftItems: ShoppingItem[]
  grandTotal: number
}>()

const crystalColors: Record<string, string> = {
  '火': '#F87171', '水': '#60A5FA', '風': '#34D399',
  '雷': '#FBBF24', '冰': '#A78BFA', '土': '#F472B6',
}

function getCrystalColor(name: string): string {
  for (const [key, color] of Object.entries(crystalColors)) {
    if (name.includes(key)) return color
  }
  return '#94A3B8'
}
</script>

<template>
  <div>
    <!-- Crystals -->
    <div v-if="crystals.length > 0" style="margin-bottom: 16px;">
      <el-text size="small" type="info" tag="div" style="margin-bottom: 8px;">水晶（不計入費用）</el-text>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <el-tag v-for="c in crystals" :key="c.itemId" effect="dark" round>
          <span :style="{ color: getCrystalColor(c.name) }">●</span>
          {{ c.name }} ×{{ c.amount }}
        </el-tag>
      </div>
      <el-divider />
    </div>

    <!-- Server groups -->
    <div v-for="group in serverGroups" :key="group.server" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div>
          <el-tag type="primary">{{ group.server }}</el-tag>
          <el-text size="small" type="info" style="margin-left: 8px;">{{ group.items.length }} 項素材</el-text>
        </div>
        <el-text type="warning">小計：{{ group.subtotal.toLocaleString() }} Gil</el-text>
      </div>
      <el-table :data="group.items" size="small">
        <el-table-column label="" width="40">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" style="width:20px;height:20px;border-radius:2px;" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" />
        <el-table-column label="類型" width="60">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'hq' ? 'warning' : 'info'">
              {{ row.type.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="數量" prop="amount" width="60" />
        <el-table-column label="單價" width="90">
          <template #default="{ row }">{{ row.unitPrice.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="小計" width="90">
          <template #default="{ row }">
            <el-text type="warning">{{ (row.unitPrice * row.amount).toLocaleString() }}</el-text>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Self-craft -->
    <div v-if="selfCraftItems.length > 0" style="margin-bottom: 16px;">
      <div style="margin-bottom: 8px;">
        <el-tag type="success">需自行製作</el-tag>
        <el-text size="small" type="info" style="margin-left: 8px;">{{ selfCraftItems.length }} 項素材</el-text>
      </div>
      <el-table :data="selfCraftItems" size="small">
        <el-table-column label="" width="40">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" style="width:20px;height:20px;" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" />
        <el-table-column label="數量" prop="amount" width="60" />
      </el-table>
    </div>

    <el-divider />
    <div style="text-align: right; font-size: 18px; font-weight: bold; color: var(--el-color-warning);">
      購買合計：{{ grandTotal.toLocaleString() }} Gil
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/ShoppingList.vue
git commit -m "feat(ui): add ShoppingList component with crystal summary and server grouping"
```

---

### Task 13: TodoList Component

**Files:**
- Create: `src/components/batch/TodoList.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/TodoList.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { formatMacros } from '@/services/macro-formatter'
import { JOB_NAMES } from '@/utils/jobs'
import { ElMessage } from 'element-plus'
import type { TodoItem } from '@/stores/batch'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{ 'update:done': [index: number, done: boolean] }>()

const expandedMacro = ref<number | null>(null)

function toggleMacro(index: number) {
  expandedMacro.value = expandedMacro.value === index ? null : index
}

function getMacros(item: TodoItem): string[] {
  return formatMacros(item.actions)
}

async function copyMacro(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('巨集已複製')
  } catch {
    ElMessage.error('複製失敗')
  }
}

function getJobName(abbr: string): string {
  return JOB_NAMES[abbr] ?? abbr
}

function toggleDone(index: number) {
  emit('update:done', index, !props.items[index].done)
}

function resetAll() {
  for (let i = 0; i < props.items.length; i++) {
    emit('update:done', i, false)
  }
}
</script>

<template>
  <div>
    <el-text size="small" type="info" tag="div" style="margin-bottom: 12px;">
      製作順序（依相依性排列，由底層半成品到頂層成品）
    </el-text>

    <div v-for="(item, index) in items" :key="index" style="border-bottom: 1px solid var(--el-border-color-lighter); padding: 12px 0;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <el-checkbox :model-value="item.done" @update:model-value="() => toggleDone(index)" />
        <el-text type="info" size="small" style="width: 24px; text-align: center;">{{ index + 1 }}</el-text>
        <div style="flex: 1;">
          <div :style="{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--el-text-color-placeholder)' : '' }">
            <img v-if="item.recipe.icon" :src="item.recipe.icon" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;border-radius:2px;" />
            {{ item.recipe.name }}
          </div>
          <el-text size="small" type="info">
            ×{{ item.quantity }} |
            <el-tag size="small" type="primary">{{ getJobName(item.recipe.job) }}</el-tag>
            {{ item.isSemiFinished ? '半成品' : '' }}
          </el-text>
        </div>
        <el-button size="small" @click="toggleMacro(index)">
          {{ expandedMacro === index ? '收起巨集' : '查看巨集' }}
        </el-button>
      </div>

      <!-- Macro expansion -->
      <div v-if="expandedMacro === index" style="margin-top: 8px; margin-left: 60px;">
        <div v-for="(macro, mi) in getMacros(item)" :key="mi" style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <el-text size="small" tag="b">巨集 {{ mi + 1 }}</el-text>
            <el-button size="small" type="primary" @click="copyMacro(macro)">複製</el-button>
          </div>
          <pre style="margin:0;padding:12px;background:var(--el-fill-color-light);border-radius:4px;font-size:12px;line-height:1.6;white-space:pre;cursor:pointer;" @click="copyMacro(macro)">{{ macro }}</pre>
        </div>
      </div>
    </div>

    <div v-if="items.length > 0" style="display: flex; justify-content: space-between; margin-top: 12px;">
      <el-text size="small" type="info">
        進度：{{ items.filter(i => i.done).length }} / {{ items.length }} 完成
      </el-text>
      <el-button size="small" @click="resetAll">全部重設</el-button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/TodoList.vue
git commit -m "feat(ui): add TodoList component with macro expansion and done tracking"
```

---

### Task 14: ExceptionList Component

**Files:**
- Create: `src/components/batch/ExceptionList.vue`

- [ ] **Step 1: Implement component**

```vue
<!-- src/components/batch/ExceptionList.vue -->
<script setup lang="ts">
import type { BatchException } from '@/stores/batch'

defineProps<{ exceptions: BatchException[] }>()
</script>

<template>
  <div>
    <div
      v-for="(exc, i) in exceptions"
      :key="i"
      style="margin-bottom: 8px; padding: 12px; border-radius: 6px;"
      :style="{
        background: exc.action === 'buy-finished' ? 'var(--el-color-warning-light-9)' : 'var(--el-color-danger-light-9)',
        border: `1px solid ${exc.action === 'buy-finished' ? 'var(--el-color-warning-light-5)' : 'var(--el-color-danger-light-5)'}`,
      }"
    >
      <div style="font-weight: 500; margin-bottom: 4px;">
        <el-text :type="exc.action === 'buy-finished' ? 'warning' : 'danger'">
          {{ exc.message }} — {{ exc.action === 'buy-finished' ? '已改為購買成品' : '已跳過' }}
        </el-text>
      </div>
      <el-text size="small" type="info">{{ exc.details }}</el-text>
      <div v-if="exc.buyPrice" style="margin-top: 6px;">
        <el-text size="small" type="warning">
          購買價：{{ exc.buyPrice.toLocaleString() }} Gil{{ exc.buyServer ? `（${exc.buyServer}）` : '' }}
        </el-text>
      </div>
    </div>
    <el-empty v-if="exceptions.length === 0" description="無例外" />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/ExceptionList.vue
git commit -m "feat(ui): add ExceptionList component for batch exceptions display"
```

---

## Chunk 4: Integration — BatchView Orchestration

### Task 15: Assemble BatchView

**Files:**
- Modify: `src/views/BatchView.vue`

- [ ] **Step 1: Implement full BatchView (thin — orchestration is in service layer)**

```vue
<!-- src/views/BatchView.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { runBatchOptimization } from '@/services/batch-optimizer'
import BatchList from '@/components/batch/BatchList.vue'
import BatchSettings from '@/components/batch/BatchSettings.vue'
import BatchProgress from '@/components/batch/BatchProgress.vue'
import ShoppingList from '@/components/batch/ShoppingList.vue'
import TodoList from '@/components/batch/TodoList.vue'
import ExceptionList from '@/components/batch/ExceptionList.vue'

const batchStore = useBatchStore()
const settings = useSettingsStore()
const gearsets = useGearsetsStore()

const hasResults = computed(() => batchStore.results !== null)
const exceptionCount = computed(() => batchStore.results?.exceptions.length ?? 0)

async function startOptimization() {
  if (batchStore.targets.length === 0) return

  batchStore.isRunning = true
  batchStore.isCancelled = false
  batchStore.clearResults()

  try {
    const results = await runBatchOptimization(
      batchStore.targets,
      (job) => gearsets.getGearsetForJob(job),
      {
        crossServer: settings.crossServer,
        recursivePricing: settings.recursivePricing,
        maxRecursionDepth: settings.maxRecursionDepth,
        exceptionStrategy: settings.exceptionStrategy,
        server: settings.server,
        dataCenter: settings.dataCenter,
      },
      (current, total, name) => {
        batchStore.progress = { current, total, currentName: name }
      },
      () => batchStore.isCancelled,
    )
    batchStore.results = results
  } catch (err) {
    console.error('[BatchView] Optimization failed:', err)
  } finally {
    batchStore.isRunning = false
  }
}

function handleTodoDone(index: number, done: boolean) {
  if (batchStore.results) {
    batchStore.results.todoList[index].done = done
  }
}
</script>

<template>
  <div class="batch-view">
    <h2 style="margin-bottom: 24px;">批量製作</h2>

    <BatchList />
    <BatchSettings style="margin-top: 16px;" />

    <div style="text-align: center; margin: 20px 0;">
      <el-button
        type="primary"
        size="large"
        :disabled="batchStore.targets.length === 0 || batchStore.isRunning"
        @click="startOptimization"
      >
        ▶ 開始最佳化計算
      </el-button>
    </div>

    <BatchProgress />

    <el-card v-if="hasResults" shadow="never" style="margin-top: 16px;">
      <el-tabs>
        <el-tab-pane label="採購清單">
          <ShoppingList
            :crystals="batchStore.results!.crystals"
            :server-groups="batchStore.results!.serverGroups"
            :self-craft-items="batchStore.results!.selfCraftItems"
            :grand-total="batchStore.results!.grandTotal"
          />
        </el-tab-pane>
        <el-tab-pane label="製作待辦">
          <TodoList
            :items="batchStore.results!.todoList"
            @update:done="handleTodoDone"
          />
        </el-tab-pane>
        <el-tab-pane v-if="exceptionCount > 0">
          <template #label>
            <span style="color: var(--el-color-danger);">
              例外提示
              <el-badge :value="exceptionCount" :max="99" style="margin-left: 4px;" />
            </span>
          </template>
          <ExceptionList :exceptions="batchStore.results!.exceptions" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.batch-view {
  max-width: 960px;
}
</style>
```

- [ ] **Step 2: Verify full flow end-to-end**

1. Add 2-3 recipes from Recipe view
2. Navigate to /batch
3. Configure settings
4. Click "開始最佳化計算"
5. Watch progress bar
6. Verify shopping list appears with server groups
7. Verify todo list with macro expand/copy
8. Test exception handling (set a job gearset to level 1)

- [ ] **Step 3: Commit**

```bash
git add src/views/BatchView.vue
git commit -m "feat(batch): assemble BatchView with full optimization flow and result tabs"
```

---

### Task 16: Final Integration Test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Fix any failures**

If any test fails, fix and re-run.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: fix any remaining test issues from batch craft integration"
```

---

## Post-Implementation Notes

### Design Decisions
1. **HQ/NQ distinction**: `hqAmounts` from optimizer determines per-material type. HQ materials use `minPriceHQ`, NQ use `minPriceNQ`.
2. **Cross-server grouping**: Uses `getMarketDataByDC` per item → `aggregateByWorld` → pick cheapest server per material. Simple greedy, no NP-hard optimization.
3. **Recursive BOM**: Uses existing `buildMaterialTree` + `computeOptimalCosts` for semi-finished products. Self-craft items enter the todo list.
4. **Topological sort**: Uses existing `getCraftingOrder` for todo list ordering.
5. **Buy-finished exception**: Queries finished product market price via `getMarketData`.

### Future Enhancements (backlog)
- Solver caching: same recipe+gearset combo reuses result
- Price staleness warning (>24hr since last Universalis update)
- Available listing quantity display
