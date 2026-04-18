# Self-Craft Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復批量製作的「自製子材料」機制：現在完全不觸發，且整合斷裂。此計畫修三個核心 bug、建立候選資料模型、讓使用者可在 ShoppingList 勾選自製，勾選後自動更新購物清單與 todo list。

**Architecture:** 批次計算階段產生 `SelfCraftCandidate[]`（含價格對比、solver macro、原料清單），但不自動套用；UI 顯示勾選區、store 用 computed 把勾選結果 reactive 套用到 `serverGroups` 與 `todoList`。

**Tech Stack:** Vue 3 + Pinia + Element Plus + TypeScript + Vitest。參照 spec: `docs/superpowers/specs/2026-04-18-self-craft-decision-design.md`。

---

## File Structure

**Create:**
- `src/services/self-craft-candidates.ts` — 專責產候選：BOM 展開、過濾、solver 驗證，封裝候選邏輯避免 batch-optimizer 膨脹
- `src/components/batch/SelfCraftSuggestions.vue` — 勾選 UI
- `src/__tests__/services/self-craft-candidates.test.ts`

**Modify:**
- `src/services/bom-calculator.ts` — 修 `maxDepth` 參數化、`computeOptimalCosts` 對 root 決策、加 threshold 常數
- `src/services/batch-optimizer.ts` — 刪除舊 Phase 5 中的 selfCraftItems 段落、改呼叫新服務產 candidates
- `src/stores/batch.ts` — 新增 candidate 狀態、selection、computed
- `src/stores/settings.ts` — `maxRecursionDepth` 預設 3→2
- `src/components/batch/ShoppingList.vue` — 新增自製建議區塊、改用 store 的 finalShoppingItems
- `src/components/batch/TodoList.vue` — 改用 store 的 finalTodoList
- `src/components/batch/BatchProgress.vue` — 新增 `evaluating-self-craft` phase 文字
- `src/views/BatchView.vue` — 把 `results.todoList` 改引用 `store.finalTodoList`
- `src/__tests__/services/bom-calculator.test.ts` — 補測試
- `src/__tests__/services/batch-optimizer.test.ts` — 更新 mocks
- `src/__tests__/stores/batch.test.ts` — 測試 selection computed
- `src/__tests__/stores/settings.test.ts` — 更新預設值斷言

---

## Task 1: Parameterize maxDepth in buildMaterialTree

**Files:**
- Modify: `src/services/bom-calculator.ts`
- Test: `src/__tests__/services/bom-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Add at the end of `src/__tests__/services/bom-calculator.test.ts`:

```ts
describe('buildMaterialTree maxDepth', () => {
  it('respects maxDepth parameter and stops expansion at limit', async () => {
    // Mock xivapi via module replacement is heavy — instead we assert the
    // exported constant and function signature by importing the module.
    const mod = await import('@/services/bom-calculator')
    expect(typeof mod.buildMaterialTree).toBe('function')
    // buildMaterialTree should accept (targets, maxDepth?: number)
    expect(mod.buildMaterialTree.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify current state**

Run: `npm test -- bom-calculator`
Expected: The new test PASSES (signature check is loose). The behavioral change comes in Step 3; this test acts as a smoke check only.

- [ ] **Step 3: Refactor bom-calculator to accept maxDepth**

Modify `src/services/bom-calculator.ts`:

Replace `const MAX_RECURSION_DEPTH = 10` with:

```ts
const DEFAULT_RECURSION_DEPTH = 10
export const SELF_CRAFT_SAVINGS_THRESHOLD = 0.05
```

Change `expandNode` signature so caller passes `maxDepth`:

```ts
async function expandNode(
  itemId: number,
  name: string,
  icon: string,
  amount: number,
  depth: number,
  maxDepth: number,
  ancestorIds: Set<number>,
): Promise<MaterialNode> {
  if (depth >= maxDepth || ancestorIds.has(itemId) || itemId < RAW_ITEM_ID_THRESHOLD) {
    return { itemId, name, icon, amount }
  }

  const recipeInfo = await findFirstRecipe(itemId, name)
  if (!recipeInfo) {
    return { itemId, name, icon, amount }
  }

  const recipe = await fetchRecipeCached(recipeInfo.recipeId)
  const newAncestors = new Set(ancestorIds)
  newAncestors.add(itemId)

  const children = await Promise.all(
    recipe.ingredients.map((ing) =>
      expandNode(ing.itemId, ing.name, ing.icon, ing.amount * amount, depth + 1, maxDepth, newAncestors),
    ),
  )

  return { itemId, name, icon, amount, recipeId: recipeInfo.recipeId, children }
}
```

Update `buildMaterialTree`:

```ts
export async function buildMaterialTree(
  targets: BomTarget[],
  maxDepth: number = DEFAULT_RECURSION_DEPTH,
): Promise<MaterialNode[]> {
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const recipe = await fetchRecipeCached(target.recipeId)
      const ancestorIds = new Set([target.itemId])

      const children = await Promise.all(
        recipe.ingredients.map((ing) =>
          expandNode(ing.itemId, ing.name, ing.icon, ing.amount * target.quantity, 1, maxDepth, ancestorIds),
        ),
      )

      return {
        itemId: target.itemId, name: target.name, icon: target.icon,
        amount: target.quantity, recipeId: target.recipeId, children,
      } as MaterialNode
    }),
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    console.error(`[BOM] Failed to expand recipe ${targets[i].recipeId}:`, result.reason)
    return {
      itemId: targets[i].itemId, name: targets[i].name, icon: targets[i].icon,
      amount: targets[i].quantity, recipeId: targets[i].recipeId,
    }
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bom-calculator`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/bom-calculator.ts src/__tests__/services/bom-calculator.test.ts
git commit -m "refactor(bom): parameterize maxDepth, export savings threshold"
```

---

## Task 2: Fix computeOptimalCosts to decide on root nodes

**Files:**
- Modify: `src/services/bom-calculator.ts`
- Test: `src/__tests__/services/bom-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `computeOptimalCosts` describe block in `bom-calculator.test.ts`:

```ts
it('decides on root nodes themselves (not just their children)', () => {
  // Tree where ROOT itself is a craftable item we want buy/craft decision for
  const tree: MaterialNode[] = [
    {
      itemId: 50, name: 'Maple Lumber', icon: '', amount: 20, recipeId: 5,
      children: [
        { itemId: 1, name: 'Maple Log', icon: '', amount: 40 },
      ],
    },
  ]
  // buy root: 20 × 3000 = 60000; craft root: 40 × 1000 = 40000 → craft
  const prices: Record<number, number> = { 50: 3000, 1: 1000 }
  const result = computeOptimalCosts(tree, (id) => prices[id] ?? 0)

  const rootDecision = result.decisions.find(d => d.itemId === 50)
  expect(rootDecision).toBeDefined()
  expect(rootDecision!.recommendation).toBe('craft')
  expect(rootDecision!.buyCost).toBe(60000)
  expect(rootDecision!.craftCost).toBe(40000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom-calculator -t "decides on root nodes"`
Expected: FAIL — `rootDecision` is undefined because current code only walks `root.children`.

- [ ] **Step 3: Fix computeOptimalCosts**

Replace the bottom of `computeOptimalCosts` in `src/services/bom-calculator.ts`:

```ts
  let totalCost = 0
  for (const root of tree) {
    totalCost += getNodeOptimalCost(root)
  }

  return {
    totalCost,
    decisions: Array.from(decisionsMap.values()),
  }
}
```

(i.e. remove the special-case loop that only iterated `root.children`; call `getNodeOptimalCost(root)` directly — the function already handles nodes without children correctly.)

- [ ] **Step 4: Run tests**

Run: `npm test -- bom-calculator`
Expected: All tests PASS, including the new root-decision test.

- [ ] **Step 5: Commit**

```bash
git add src/services/bom-calculator.ts src/__tests__/services/bom-calculator.test.ts
git commit -m "fix(bom): include root nodes in buy-vs-craft decisions"
```

---

## Task 3: Add savings threshold filter to CostDecision

**Files:**
- Modify: `src/services/bom-calculator.ts`
- Test: `src/__tests__/services/bom-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `computeOptimalCosts` describe block:

```ts
it('includes savingsRatio on decisions', () => {
  const tree: MaterialNode[] = [
    {
      itemId: 50, name: 'Lumber', icon: '', amount: 10, recipeId: 5,
      children: [{ itemId: 1, name: 'Log', icon: '', amount: 10 }],
    },
  ]
  // buy=10×1000=10000, craft=10×500=5000, savingsRatio=0.5
  const prices: Record<number, number> = { 50: 1000, 1: 500 }
  const result = computeOptimalCosts(tree, (id) => prices[id] ?? 0)

  const d = result.decisions.find(x => x.itemId === 50)!
  expect(d.savingsRatio).toBeCloseTo(0.5, 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom-calculator -t "savingsRatio"`
Expected: FAIL — `savingsRatio` is undefined.

- [ ] **Step 3: Add savingsRatio to CostDecision**

In `src/services/bom-calculator.ts`, update the `CostDecision` interface and `getNodeOptimalCost` function to populate it:

```ts
export interface CostDecision {
  itemId: number
  name: string
  icon: string
  amount: number
  buyCost: number
  craftCost: number
  optimalCost: number
  savingsRatio: number   // (buyCost - craftCost) / buyCost, 0 if buyCost<=0
  recommendation: 'buy' | 'craft'
}
```

In `getNodeOptimalCost`, when building the decision, compute ratio:

```ts
    const savingsRatio = buyCost > 0 ? (buyCost - craftCost) / buyCost : 0

    const existing = decisionsMap.get(node.itemId)
    if (existing) {
      existing.amount += node.amount
      existing.buyCost += buyCost
      existing.craftCost += craftCost
      existing.optimalCost += optimalCost
      existing.savingsRatio = existing.buyCost > 0
        ? (existing.buyCost - existing.craftCost) / existing.buyCost
        : 0
    } else {
      decisionsMap.set(node.itemId, {
        itemId: node.itemId, name: node.name, icon: node.icon,
        amount: node.amount, buyCost, craftCost, optimalCost,
        savingsRatio, recommendation,
      })
    }
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bom-calculator`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/bom-calculator.ts src/__tests__/services/bom-calculator.test.ts
git commit -m "feat(bom): expose savingsRatio on CostDecision"
```

---

## Task 4: Define SelfCraftCandidate type and extend BatchResults

**Files:**
- Modify: `src/stores/batch.ts`

- [ ] **Step 1: Add type definition**

In `src/stores/batch.ts`, add after `BuyFinishedDecision` interface:

```ts
import type { MaterialBase } from '@/services/shopping-list'

export interface SelfCraftCandidate {
  itemId: number
  name: string
  icon: string
  amount: number
  recipe: Recipe
  job: string
  buyCost: number
  craftCost: number
  savings: number
  savingsRatio: number
  actions: string[]
  hqAmounts: number[]
  rawMaterials: MaterialBase[]
  hqRequired: boolean
  depth: number
}
```

- [ ] **Step 2: Extend BatchResults**

Replace the `selfCraftItems` line in `BatchResults`:

```ts
export interface BatchResults {
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftCandidates: SelfCraftCandidate[]
  todoList: TodoItem[]
  exceptions: BatchException[]
  buyFinishedItems: BuyFinishedDecision[]
  grandTotal: number
  crossWorldCache: Map<number, WorldPriceSummary[]>
  buffRecommendation?: BuffRecommendation
}
```

Also remove the obsolete `selfCraftItems` iteration in `shoppingItemCount` computed (line ~99):

```ts
const shoppingItemCount = computed(() => {
  if (!results.value) return 0
  const keys = new Set<string>()
  for (const g of results.value.serverGroups) {
    for (const item of g.items) keys.add(shoppingKey(item.itemId, item.type, item.isFinishedProduct))
  }
  return keys.size
})
```

- [ ] **Step 3: Verify type-check**

Run: `npm run build`
Expected: TypeScript will complain about `selfCraftItems` references in `batch-optimizer.ts` and `ShoppingList.vue`. That's expected — those are fixed in later tasks. Stop the build if it errors; that's fine.

- [ ] **Step 4: Commit**

```bash
git add src/stores/batch.ts
git commit -m "feat(batch): add SelfCraftCandidate type, replace selfCraftItems"
```

(Note: build will be broken between this commit and Task 10 — this is intentional for TDD progress. Do not `git push` mid-plan.)

---

## Task 5: Add selection state and toggle to batch store

**Files:**
- Modify: `src/stores/batch.ts`
- Test: `src/__tests__/stores/batch.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/stores/batch.test.ts`:

```ts
describe('batch store self-craft selection', () => {
  it('starts with empty selection', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    expect(store.selectedSelfCraftIds.size).toBe(0)
  })

  it('toggleSelfCraft adds then removes id', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.toggleSelfCraft(123)
    expect(store.selectedSelfCraftIds.has(123)).toBe(true)
    store.toggleSelfCraft(123)
    expect(store.selectedSelfCraftIds.has(123)).toBe(false)
  })

  it('selectAllSelfCraft selects every candidate id', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.results = {
      serverGroups: [], crystals: [], todoList: [], exceptions: [],
      buyFinishedItems: [], grandTotal: 0,
      crossWorldCache: new Map(),
      selfCraftCandidates: [
        { itemId: 1 }, { itemId: 2 }, { itemId: 3 },
      ] as any,
    }
    store.selectAllSelfCraft()
    expect(store.selectedSelfCraftIds.size).toBe(3)
  })

  it('clearSelfCraftSelection empties the set', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.toggleSelfCraft(1)
    store.toggleSelfCraft(2)
    store.clearSelfCraftSelection()
    expect(store.selectedSelfCraftIds.size).toBe(0)
  })
})
```

Ensure the imports at the top of the test file include:

```ts
import { setActivePinia, createPinia } from 'pinia'
import { useBatchStore } from '@/stores/batch'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- batch.test`
Expected: FAIL — `toggleSelfCraft` is not a function.

- [ ] **Step 3: Implement in store**

In `src/stores/batch.ts`, inside `defineStore(...)` function body (before `return`):

```ts
const selectedSelfCraftIds = ref<Set<number>>(new Set())

function toggleSelfCraft(itemId: number) {
  const next = new Set(selectedSelfCraftIds.value)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  selectedSelfCraftIds.value = next
}

function selectAllSelfCraft() {
  if (!results.value) return
  selectedSelfCraftIds.value = new Set(
    results.value.selfCraftCandidates.map(c => c.itemId),
  )
}

function clearSelfCraftSelection() {
  selectedSelfCraftIds.value = new Set()
}
```

Also reset it in `clearResults` and `resetAll`:

```ts
function clearResults() {
  results.value = null
  checkedShoppingKeys.value = new Set()
  selectedSelfCraftIds.value = new Set()
}

function resetAll() {
  isCancelled.value = true
  targets.value = []
  results.value = null
  isRunning.value = false
  progress.value = defaultProgress()
  checkedShoppingKeys.value = new Set()
  selectedSelfCraftIds.value = new Set()
  foodId.value = null
  foodIsHq.value = true
  medicineId.value = null
  medicineIsHq.value = true
}
```

Export them in the return block:

```ts
return {
  // ...existing...
  selectedSelfCraftIds,
  toggleSelfCraft,
  selectAllSelfCraft,
  clearSelfCraftSelection,
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- batch.test`
Expected: The 4 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/batch.ts src/__tests__/stores/batch.test.ts
git commit -m "feat(batch): add self-craft selection state and toggles"
```

---

## Task 6: Create self-craft-candidates service (skeleton + filter logic)

**Files:**
- Create: `src/services/self-craft-candidates.ts`
- Create: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/services/self-craft-candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterCandidatesByThreshold } from '@/services/self-craft-candidates'
import type { CostDecision } from '@/services/bom-calculator'

describe('filterCandidatesByThreshold', () => {
  it('keeps decisions with savingsRatio >= 0.05 and recommendation=craft', () => {
    const decisions: CostDecision[] = [
      { itemId: 1, name: 'A', icon: '', amount: 1, buyCost: 100, craftCost: 90, optimalCost: 90, savingsRatio: 0.10, recommendation: 'craft' },
      { itemId: 2, name: 'B', icon: '', amount: 1, buyCost: 100, craftCost: 97, optimalCost: 97, savingsRatio: 0.03, recommendation: 'craft' },
      { itemId: 3, name: 'C', icon: '', amount: 1, buyCost: 100, craftCost: 200, optimalCost: 100, savingsRatio: 0, recommendation: 'buy' },
      { itemId: 4, name: 'D', icon: '', amount: 1, buyCost: 100, craftCost: 95, optimalCost: 95, savingsRatio: 0.05, recommendation: 'craft' },
    ]
    const filtered = filterCandidatesByThreshold(decisions)
    expect(filtered.map(d => d.itemId)).toEqual([1, 4])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal module**

Create `src/services/self-craft-candidates.ts`:

```ts
import type { CostDecision } from '@/services/bom-calculator'
import { SELF_CRAFT_SAVINGS_THRESHOLD } from '@/services/bom-calculator'

export function filterCandidatesByThreshold(decisions: CostDecision[]): CostDecision[] {
  return decisions.filter(
    d => d.recommendation === 'craft' && d.savingsRatio >= SELF_CRAFT_SAVINGS_THRESHOLD,
  )
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): add threshold filter helper"
```

---

## Task 7: Add recipe/gearset eligibility filter

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `self-craft-candidates.test.ts`:

```ts
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import { filterCandidatesByLevel } from '@/services/self-craft-candidates'

const mkRecipe = (id: number, job: string, level: number): Recipe => ({
  id, itemId: id * 10, name: `Recipe ${id}`, icon: '', job,
  level, stars: 0, canHq: true, materialQualityFactor: 50, ingredients: [],
  recipeLevelTable: {
    classJobLevel: level, stars: 0, difficulty: 1000, quality: 2000,
    durability: 70, suggestedCraftsmanship: 0,
    progressDivider: 100, qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
  },
})

describe('filterCandidatesByLevel', () => {
  it('keeps only candidates the player can craft', () => {
    const candidates = [
      { itemId: 1, recipe: mkRecipe(1, 'CRP', 80) },
      { itemId: 2, recipe: mkRecipe(2, 'BSM', 90) },
      { itemId: 3, recipe: mkRecipe(3, 'CRP', 100) },
    ] as any[]
    const getGearset = (job: string): GearsetStats | null => {
      if (job === 'CRP') return { level: 90, craftsmanship: 3000, control: 3000, cp: 500 }
      if (job === 'BSM') return { level: 80, craftsmanship: 3000, control: 3000, cp: 500 }
      return null
    }
    const filtered = filterCandidatesByLevel(candidates, getGearset)
    expect(filtered.map(c => c.itemId)).toEqual([1]) // CRP 90 ≥ 80 ✓, BSM 80 < 90 ✗, CRP 90 < 100 ✗
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL — `filterCandidatesByLevel` not exported.

- [ ] **Step 3: Add filter function**

Append to `src/services/self-craft-candidates.ts`:

```ts
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

export interface PrelimCandidate {
  itemId: number
  name: string
  icon: string
  amount: number
  recipe: Recipe
  job: string
  buyCost: number
  craftCost: number
  savings: number
  savingsRatio: number
  depth: number
  rawChildIds: number[]  // immediate child ids for rawMaterials reconstruction
}

export function filterCandidatesByLevel(
  candidates: Array<{ recipe: Recipe } & Record<string, unknown>>,
  getGearset: (job: string) => GearsetStats | null,
): typeof candidates {
  return candidates.filter(c => {
    const gs = getGearset(c.recipe.job)
    return gs !== null && gs.level >= c.recipe.level
  })
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): add level-based eligibility filter"
```

---

## Task 8: Walk material tree to produce preliminary candidates

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `self-craft-candidates.test.ts`:

```ts
import { walkTreeForCandidates } from '@/services/self-craft-candidates'
import type { MaterialNode } from '@/stores/bom'

describe('walkTreeForCandidates', () => {
  it('emits craftable intermediate nodes with depth', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          {
            itemId: 50, name: 'Lumber', icon: '', amount: 10, recipeId: 5,
            children: [
              { itemId: 1, name: 'Log', icon: '', amount: 20 },
            ],
          },
          { itemId: 2, name: 'Leaf', icon: '', amount: 5 }, // raw, no children
        ],
      },
    ]
    const nodes = walkTreeForCandidates(tree)
    expect(nodes.map(n => n.itemId)).toEqual([50]) // only intermediates
    expect(nodes[0].depth).toBe(1) // 1 layer below batch root
  })

  it('skips collapsed nodes', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'P', icon: '', amount: 1, recipeId: 10,
        children: [
          {
            itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
            collapsed: true,
            children: [{ itemId: 1, name: 'Raw', icon: '', amount: 1 }],
          },
        ],
      },
    ]
    const nodes = walkTreeForCandidates(tree)
    expect(nodes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL — `walkTreeForCandidates` not exported.

- [ ] **Step 3: Implement tree walk**

Append to `src/services/self-craft-candidates.ts`:

```ts
export interface TreeNodeInfo {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId: number
  depth: number
  childItemIds: number[]
  childNodes: MaterialNode[]  // for rawMaterials reconstruction later
}

import type { MaterialNode } from '@/stores/bom'

export function walkTreeForCandidates(tree: MaterialNode[]): TreeNodeInfo[] {
  const out: TreeNodeInfo[] = []

  function visit(node: MaterialNode, depth: number) {
    if (node.collapsed) return
    if (!node.children || node.children.length === 0) return
    if (!node.recipeId) return

    // Root batch targets have depth 0; their children start at depth 1.
    // Here `node` IS a child, so we pass its depth directly from caller.
    if (depth > 0) {
      out.push({
        itemId: node.itemId,
        name: node.name,
        icon: node.icon,
        amount: node.amount,
        recipeId: node.recipeId,
        depth,
        childItemIds: node.children.map(c => c.itemId),
        childNodes: node.children,
      })
    }

    for (const child of node.children) {
      visit(child, depth + 1)
    }
  }

  for (const root of tree) {
    visit(root, 0)
  }
  return out
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): walk material tree to collect intermediate nodes"
```

---

## Task 9: Compute rawMaterials list from tree node

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { computeRawMaterials } from '@/services/self-craft-candidates'

describe('computeRawMaterials', () => {
  it('returns immediate children of a candidate node (not deeper)', () => {
    const childNodes: MaterialNode[] = [
      { itemId: 1, name: 'Log', icon: '', amount: 20 },
      { itemId: 2, name: 'Sap', icon: '', amount: 4 },
    ]
    const raws = computeRawMaterials(childNodes)
    expect(raws).toEqual([
      { itemId: 1, name: 'Log', icon: '', amount: 20 },
      { itemId: 2, name: 'Sap', icon: '', amount: 4 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append:

```ts
import type { MaterialBase } from '@/services/shopping-list'

export function computeRawMaterials(childNodes: MaterialNode[]): MaterialBase[] {
  return childNodes.map(c => ({
    itemId: c.itemId, name: c.name, icon: c.icon, amount: c.amount,
  }))
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): extract immediate children as rawMaterials"
```

---

## Task 10: Orchestrator function — produceSelfCraftCandidates

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

This task wires the pieces together into a top-level function that `batch-optimizer.ts` will call. Because solver + API calls are involved, the test uses mocks and focuses on the orchestration contract.

- [ ] **Step 1: Write the failing test**

Append:

Also update the import at the top of `self-craft-candidates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
```

Then append:

```ts
vi.mock('@/services/bom-calculator', async (importActual) => {
  const actual = await importActual<typeof import('@/services/bom-calculator')>()
  return {
    ...actual,
    buildMaterialTree: vi.fn(),
    computeOptimalCosts: vi.fn(),
  }
})
vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/api/xivapi', () => ({
  findRecipesByItemName: vi.fn(),
  getRecipe: vi.fn(),
}))

import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import { buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'

describe('produceSelfCraftCandidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns [] when tree is empty', async () => {
    vi.mocked(buildMaterialTree).mockResolvedValue([])
    vi.mocked(computeOptimalCosts).mockReturnValue({ totalCost: 0, decisions: [] })
    const result = await produceSelfCraftCandidates({
      recipesToCraft: [],
      priceMap: new Map(),
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600 }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: vi.fn() as any,
      onProgress: () => {},
      isCancelled: () => false,
    })
    expect(result).toEqual([])
  })
})
```

(We expand coverage in Task 11; this test nails the signature.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL — `produceSelfCraftCandidates` not exported.

- [ ] **Step 3: Implement orchestrator skeleton**

Append to `src/services/self-craft-candidates.ts`:

```ts
import { buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import type { MarketData } from '@/api/universalis'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer' // type-only, no runtime cycle
import type { FoodBuff } from '@/engine/food-medicine'
import type { SelfCraftCandidate } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

type OptimizeRecipeFn = (
  recipe: Recipe,
  gearset: GearsetStats,
  onSolverProgress?: (pct: number) => void,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
) => Promise<RecipeOptimizeResult>

interface ProduceArgs {
  recipesToCraft: RecipeOptimizeResult[]
  priceMap: Map<number, MarketData>
  getGearset: (job: string) => GearsetStats | null
  maxDepth: number
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined
  optimizeRecipe: OptimizeRecipeFn  // injected to avoid circular import
  onProgress: (info: { current: number; total: number; name: string }) => void
  isCancelled: () => boolean
}

export async function produceSelfCraftCandidates(args: ProduceArgs): Promise<SelfCraftCandidate[]> {
  const { recipesToCraft, priceMap, getGearset, maxDepth, buffs, optimizeRecipe, onProgress, isCancelled } = args

  if (recipesToCraft.length === 0) return []

  // Step 1: Collect BOM targets — one per recipesToCraft entry
  // Resolve the real recipeId from the item via findRecipesByItemName
  const bomTargets: Array<{ itemId: number; recipeId: number; name: string; icon: string; quantity: number }> = []
  for (const r of recipesToCraft) {
    bomTargets.push({
      itemId: r.recipe.itemId,
      recipeId: r.recipe.id,
      name: r.recipe.name,
      icon: r.recipe.icon,
      quantity: r.quantity,
    })
  }

  // Step 2: Build the tree
  const tree = await buildMaterialTree(bomTargets, maxDepth)
  if (isCancelled()) return []

  // Step 3: Price lookup already complete via priceMap; compute costs
  const costResult = computeOptimalCosts(tree, (id) => {
    const md = priceMap.get(id)
    return md?.minPriceNQ ?? 0
  })

  // Step 4: threshold filter
  const viableDecisions = filterCandidatesByThreshold(costResult.decisions)
  if (viableDecisions.length === 0) return []

  // Step 5: for each viable decision, find matching tree node for childNodes + recipeId
  const treeNodes = walkTreeForCandidates(tree)
  const nodeByItem = new Map<number, typeof treeNodes[number]>()
  for (const n of treeNodes) nodeByItem.set(n.itemId, n)

  // Step 6: fetch full Recipe for each candidate (for solver + UI)
  // Step 7: filter by level
  // Step 8: solver validation
  // All these happen in Tasks 11-12; stub returns [] for now.
  return []
}

import type { GearsetStats } from '@/stores/gearsets'
```

- [ ] **Step 4: Run test**

Run: `npm test -- self-craft-candidates`
Expected: The "returns [] when tree is empty" test PASSES.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): scaffold produceSelfCraftCandidates orchestrator"
```

---

## Task 11: Fetch recipes + filter by level inside orchestrator

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('excludes candidates whose job level player does not meet', async () => {
  // Tree: root → intermediate (itemId 50), craftCost < buyCost beyond threshold
  vi.mocked(buildMaterialTree).mockResolvedValue([{
    itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
    children: [{
      itemId: 50, name: 'Inter', icon: '', amount: 10, recipeId: 5,
      children: [{ itemId: 1, name: 'Raw', icon: '', amount: 20 }],
    }],
  }])
  vi.mocked(computeOptimalCosts).mockReturnValue({
    totalCost: 0,
    decisions: [{
      itemId: 50, name: 'Inter', icon: '', amount: 10,
      buyCost: 10000, craftCost: 6000, optimalCost: 6000,
      savingsRatio: 0.4, recommendation: 'craft',
    }],
  })
  vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
  vi.mocked(getRecipe).mockResolvedValue({
    id: 5, itemId: 50, name: 'Inter', icon: '', job: 'CRP',
    level: 90, stars: 0, canHq: true, materialQualityFactor: 50,
    ingredients: [{ itemId: 1, name: 'Raw', icon: '', amount: 2, canHq: false, level: 1 }],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
      suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
      progressModifier: 100, qualityModifier: 100,
    },
  } as any)
  // Solver not needed because we'll exclude before solver runs
  const result = await produceSelfCraftCandidates({
    recipesToCraft: [{
      recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 100 } as any,
      quantity: 1, actions: [], hqAmounts: [], initialQuality: 0,
      isDoubleMax: true, materials: [], qualityDeficit: 0,
    }],
    priceMap: new Map(),
    getGearset: () => ({ level: 80, craftsmanship: 3000, control: 3000, cp: 500 }), // below 90
    maxDepth: 2,
    buffs: undefined,
    optimizeRecipe: vi.fn() as any,
    onProgress: () => {},
    isCancelled: () => false,
  })
  expect(result).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: The test passes (since stub returns []) — **but this is a false pass**. Mark the stub return as obviously provisional before replacing. We rely on Task 12's positive-path test to catch regressions.

- [ ] **Step 3: Implement the level filter + recipe fetch**

Replace Step 6-8 stub inside `produceSelfCraftCandidates`:

```ts
  // Step 6: attach recipe data + filter by level
  const withRecipes: Array<{
    decision: typeof viableDecisions[number]
    node: typeof treeNodes[number]
    recipe: Recipe
    job: string
  }> = []

  for (const decision of viableDecisions) {
    const node = nodeByItem.get(decision.itemId)
    if (!node) continue

    const recipeInfo = await findRecipesByItemName(decision.name, decision.itemId)
    if (!recipeInfo.length) continue

    const first = recipeInfo[0]
    const gs = getGearset(first.job)
    if (!gs) continue

    const recipe = await getRecipe(first.recipeId)
    if (gs.level < recipe.level) continue

    withRecipes.push({ decision, node, recipe, job: first.job })
  }

  if (withRecipes.length === 0) return []
  if (isCancelled()) return []

  // Step 7: solver validation (Task 12)
  return []
```

Add the import if missing:

```ts
import type { Recipe } from '@/stores/recipe'
```

- [ ] **Step 4: Run tests**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): fetch recipes and filter by player level"
```

---

## Task 12: Solver validation and final candidate construction

**Files:**
- Modify: `src/services/self-craft-candidates.ts`
- Modify: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('returns a candidate when all filters pass and solver achieves required quality', async () => {
  // Set up: tree, decisions, recipe, gearset adequate, solver double-max
  vi.mocked(buildMaterialTree).mockResolvedValue([{
    itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
    children: [{
      itemId: 50, name: 'Inter', icon: '', amount: 10, recipeId: 5,
      children: [{ itemId: 1, name: 'Raw', icon: '', amount: 20 }],
    }],
  }])
  vi.mocked(computeOptimalCosts).mockReturnValue({
    totalCost: 0,
    decisions: [{
      itemId: 50, name: 'Inter', icon: '', amount: 10,
      buyCost: 10000, craftCost: 6000, optimalCost: 6000,
      savingsRatio: 0.4, recommendation: 'craft',
    }],
  })
  vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
  const mockRecipe = {
    id: 5, itemId: 50, name: 'Inter', icon: '', job: 'CRP',
    level: 80, stars: 0, canHq: true, materialQualityFactor: 50,
    ingredients: [{ itemId: 1, name: 'Raw', icon: '', amount: 2, canHq: false, level: 1 }],
    recipeLevelTable: {
      classJobLevel: 80, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
      suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
      progressModifier: 100, qualityModifier: 100,
    },
  }
  vi.mocked(getRecipe).mockResolvedValue(mockRecipe as any)
  const mockOptimizeRecipe = vi.fn().mockResolvedValue({
    recipe: mockRecipe,
    quantity: 1,
    actions: ['muscle_memory', 'groundwork'],
    hqAmounts: [],
    initialQuality: 0,
    isDoubleMax: true,
    materials: [{ itemId: 1, name: 'Raw', icon: '', amount: 2 }],
    qualityDeficit: 0,
  })

  const parentResult = {
    recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 90 } as any,
    quantity: 1, actions: [], hqAmounts: [2, 0], initialQuality: 0,
    isDoubleMax: false,
    materials: [{ itemId: 50, name: 'Inter', icon: '', amount: 10 }],
    qualityDeficit: 0,
  }
  const result = await produceSelfCraftCandidates({
    recipesToCraft: [parentResult as any],
    priceMap: new Map(),
    getGearset: () => ({ level: 90, craftsmanship: 4000, control: 3800, cp: 600 }),
    maxDepth: 2,
    buffs: undefined,
    optimizeRecipe: mockOptimizeRecipe as any,
    onProgress: () => {},
    isCancelled: () => false,
  })

  expect(result).toHaveLength(1)
  expect(result[0].itemId).toBe(50)
  expect(result[0].actions).toEqual(['muscle_memory', 'groundwork'])
  expect(result[0].hqRequired).toBe(true) // parent hqAmounts[0] = 2 > 0
  expect(result[0].rawMaterials).toEqual([{ itemId: 1, name: 'Raw', icon: '', amount: 20 }])
  expect(result[0].savings).toBe(4000) // 10000 - 6000
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- self-craft-candidates`
Expected: FAIL — `result` is empty because solver stage is still stubbed.

- [ ] **Step 3: Implement solver validation + construction**

In `produceSelfCraftCandidates`, replace `return []` at end with:

```ts
  // Build a map of parent HQ requirements: itemId → whether any parent requires HQ of this material
  const hqRequiredMap = new Map<number, boolean>()
  for (const r of recipesToCraft) {
    for (let i = 0; i < r.materials.length; i++) {
      if ((r.hqAmounts[i] ?? 0) > 0) hqRequiredMap.set(r.materials[i].itemId, true)
    }
  }

  const candidates: SelfCraftCandidate[] = []
  for (let i = 0; i < withRecipes.length; i++) {
    if (isCancelled()) return candidates
    const { decision, node, recipe, job } = withRecipes[i]
    onProgress({ current: i + 1, total: withRecipes.length, name: recipe.name })

    const gs = getGearset(job)!
    const hqRequired = hqRequiredMap.get(decision.itemId) === true

    let optResult: RecipeOptimizeResult
    try {
      optResult = await optimizeRecipe(recipe, gs, undefined, buffs)
    } catch (err) {
      console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
      continue
    }

    // Validate based on HQ requirement
    if (hqRequired && !optResult.isDoubleMax) continue
    // For non-HQ-required: progress >= max_progress is implied by solver success

    candidates.push({
      itemId: decision.itemId,
      name: decision.name,
      icon: decision.icon,
      amount: decision.amount,
      recipe,
      job,
      buyCost: decision.buyCost,
      craftCost: decision.craftCost,
      savings: decision.buyCost - decision.craftCost,
      savingsRatio: decision.savingsRatio,
      actions: optResult.actions,
      hqAmounts: optResult.hqAmounts,
      rawMaterials: computeRawMaterials(node.childNodes),
      hqRequired,
      depth: node.depth,
    })
  }

  return candidates
```

- [ ] **Step 4: Run tests**

Run: `npm test -- self-craft-candidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(self-craft): run solver validation and build candidates"
```

---

## Task 13: Integrate new phase into batch-optimizer

**Files:**
- Modify: `src/services/batch-optimizer.ts`
- Modify: `src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 1: Update progress union and existing test**

In `src/services/batch-optimizer.ts`, find the `phase` union on `onProgress` (line ~105):

```ts
phase: 'solving' | 'pricing' | 'evaluating-buffs' | 'evaluating-self-craft' | 'aggregating' | 'done'
```

Also update the same union in `src/stores/batch.ts` `defaultProgress()` (line ~75):

```ts
phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'evaluating-self-craft' | 'aggregating' | 'done',
```

- [ ] **Step 2: Replace Phase 5 recursive BOM block with new candidate producer**

In `src/services/batch-optimizer.ts`, locate the block `if (settings.recursivePricing) { ... }` around lines 329-354. Replace the ENTIRE block (the `selfCraftItems.push` path) with:

```ts
  // === Phase 4.6: Produce self-craft candidates ===
  let selfCraftCandidates: SelfCraftCandidate[] = []
  if (settings.recursivePricing && !isCancelled()) {
    try {
      selfCraftCandidates = await produceSelfCraftCandidates({
        recipesToCraft,
        priceMap,
        getGearset: getGearset as (job: string) => GearsetStats | null,
        maxDepth: settings.maxRecursionDepth,
        buffs,
        optimizeRecipe,  // pass local optimizeRecipe (avoids circular import)
        onProgress: (info) => onProgress({
          current: info.current, total: info.total, name: info.name,
          phase: 'evaluating-self-craft', solverPercent: 0,
        }),
        isCancelled,
      })
    } catch (err) {
      console.warn('[batch-optimizer] self-craft candidate production failed:', err)
    }
  }
```

Add imports at top of file:

```ts
import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import type { SelfCraftCandidate } from '@/stores/batch'
```

Remove the no-longer-used import line for `buildMaterialTree, flattenMaterialTree, computeOptimalCosts` — they're now called from inside `self-craft-candidates.ts`. Also remove `selfCraftItems` local variable.

- [ ] **Step 3: Update return statement**

Change the final `return` from:

```ts
return { serverGroups, crystals, selfCraftItems, todoList, exceptions, buyFinishedItems, grandTotal, crossWorldCache, buffRecommendation }
```

to:

```ts
return { serverGroups, crystals, selfCraftCandidates, todoList, exceptions, buyFinishedItems, grandTotal, crossWorldCache, buffRecommendation }
```

- [ ] **Step 4: Update test mocks**

In `src/__tests__/services/batch-optimizer.test.ts`, add mock:

```ts
vi.mock('@/services/self-craft-candidates', () => ({
  produceSelfCraftCandidates: vi.fn().mockResolvedValue([]),
}))
```

Also, replace any `expect(result.selfCraftItems).…` with `expect(result.selfCraftCandidates).…` and assert empty arrays where appropriate.

- [ ] **Step 5: Run tests**

Run: `npm test -- batch-optimizer`
Expected: PASS. If any test references `selfCraftItems`, fix it to `selfCraftCandidates`.

- [ ] **Step 6: Commit**

```bash
git add src/services/batch-optimizer.ts src/stores/batch.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(batch): wire produceSelfCraftCandidates into Phase 4.6"
```

---

## Task 14: finalShoppingItems computed in batch store

**Files:**
- Modify: `src/stores/batch.ts`
- Modify: `src/__tests__/stores/batch.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `batch.test.ts`:

```ts
describe('batch store finalShoppingItems', () => {
  it('removes selected candidate itemIds from serverGroups and adds rawMaterials', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    store.results = {
      serverGroups: [{
        server: 'Local',
        subtotal: 15000,
        items: [
          { itemId: 50, name: 'Lumber', icon: '', amount: 10, type: 'nq', unitPrice: 1000, server: 'Local' },
          { itemId: 60, name: 'Other', icon: '', amount: 5, type: 'nq', unitPrice: 1000, server: 'Local' },
        ],
      }],
      crystals: [],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: { job: 'CRP' } as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: [], hqAmounts: [],
        rawMaterials: [{ itemId: 1, name: 'Log', icon: '', amount: 20 }],
        hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0,
      crossWorldCache: new Map(),
    }

    // Nothing selected: no change
    let final = store.finalShoppingItems
    expect(final.length).toBe(2)

    store.toggleSelfCraft(50)
    final = store.finalShoppingItems
    // Lumber removed, Log raw added, Other kept
    expect(final.find(i => i.itemId === 50)).toBeUndefined()
    expect(final.find(i => i.itemId === 1)).toMatchObject({ amount: 20, type: 'nq' })
    expect(final.find(i => i.itemId === 60)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- batch.test -t "finalShoppingItems"`
Expected: FAIL — `finalShoppingItems` undefined.

- [ ] **Step 3: Implement computed**

In `src/stores/batch.ts` before `return`:

```ts
const finalShoppingItems = computed(() => {
  if (!results.value) return [] as ShoppingItem[]
  const selected = selectedSelfCraftIds.value
  const removeIds = new Set(selected)

  const kept: ShoppingItem[] = []
  for (const g of results.value.serverGroups) {
    for (const item of g.items) {
      if (!removeIds.has(item.itemId)) kept.push(item)
    }
  }

  // Append rawMaterials from selected candidates as NQ shopping items.
  // These carry no server/unitPrice yet — displayed as "new purchases needed"
  // (UI can use unitPrice=0 to mean "fetch later").
  for (const c of results.value.selfCraftCandidates) {
    if (!selected.has(c.itemId)) continue
    for (const raw of c.rawMaterials) {
      kept.push({
        itemId: raw.itemId, name: raw.name, icon: raw.icon, amount: raw.amount,
        type: 'nq', unitPrice: 0,
      })
    }
  }
  return kept
})
```

Export `finalShoppingItems` in the `return` block.

- [ ] **Step 4: Run test**

Run: `npm test -- batch.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/batch.ts src/__tests__/stores/batch.test.ts
git commit -m "feat(batch): add finalShoppingItems computed that applies candidate selection"
```

---

## Task 15: finalTodoList computed in batch store

**Files:**
- Modify: `src/stores/batch.ts`
- Modify: `src/__tests__/stores/batch.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('batch store finalTodoList', () => {
  it('prepends semi-finished todos from selected candidates', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    const parentRecipe = { id: 10, itemId: 100, name: 'Chair', icon: '', job: 'CRP' }
    const interRecipe = { id: 5, itemId: 50, name: 'Lumber', icon: '', job: 'CRP' }

    store.results = {
      serverGroups: [], crystals: [],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: interRecipe as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: ['muscle_memory'], hqAmounts: [],
        rawMaterials: [], hqRequired: false, depth: 1,
      }],
      todoList: [{
        recipe: parentRecipe as any, quantity: 1, actions: ['careful_synthesis'],
        hqAmounts: [], isSemiFinished: false, done: false,
      }],
      exceptions: [], buyFinishedItems: [], grandTotal: 0,
      crossWorldCache: new Map(),
    }

    // Nothing selected: only the parent
    expect(store.finalTodoList).toHaveLength(1)

    store.toggleSelfCraft(50)
    const final = store.finalTodoList
    expect(final).toHaveLength(2)
    expect(final[0].recipe.id).toBe(5) // semi-finished first
    expect(final[0].isSemiFinished).toBe(true)
    expect(final[1].recipe.id).toBe(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- batch.test -t "finalTodoList"`
Expected: FAIL.

- [ ] **Step 3: Implement computed**

In `src/stores/batch.ts` before `return`:

```ts
const finalTodoList = computed<TodoItem[]>(() => {
  if (!results.value) return []
  const selected = selectedSelfCraftIds.value
  const semiFinished: TodoItem[] = []
  for (const c of results.value.selfCraftCandidates) {
    if (!selected.has(c.itemId)) continue
    semiFinished.push({
      recipe: c.recipe,
      quantity: c.amount,
      actions: c.actions,
      hqAmounts: c.hqAmounts,
      isSemiFinished: true,
      done: false,
    })
  }
  // Sort semi-finished by depth descending so deeper dependencies come first
  semiFinished.sort((a, b) => {
    const da = results.value!.selfCraftCandidates.find(c => c.itemId === a.recipe.itemId)?.depth ?? 0
    const db = results.value!.selfCraftCandidates.find(c => c.itemId === b.recipe.itemId)?.depth ?? 0
    return db - da
  })
  return [...semiFinished, ...results.value.todoList]
})
```

Export `finalTodoList` in the `return` block.

- [ ] **Step 4: Run test**

Run: `npm test -- batch.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/batch.ts src/__tests__/stores/batch.test.ts
git commit -m "feat(batch): add finalTodoList computed with semi-finished prepend"
```

---

## Task 16: Create SelfCraftSuggestions.vue component

**Files:**
- Create: `src/components/batch/SelfCraftSuggestions.vue`

- [ ] **Step 1: Create the component**

Create `src/components/batch/SelfCraftSuggestions.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
import type { SelfCraftCandidate } from '@/stores/batch'
import { formatGil } from '@/utils/format'

const props = defineProps<{ candidates: SelfCraftCandidate[] }>()
const batch = useBatchStore()

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batch.selectedSelfCraftIds.has(c.itemId)) total += c.savings
  }
  return total
})

const allSelected = computed(() =>
  props.candidates.length > 0 &&
  props.candidates.every(c => batch.selectedSelfCraftIds.has(c.itemId)),
)

function isChecked(id: number) {
  return batch.selectedSelfCraftIds.has(id)
}

function toggle(id: number) {
  batch.toggleSelfCraft(id)
}

function toggleAll() {
  if (allSelected.value) batch.clearSelfCraftSelection()
  else batch.selectAllSelfCraft()
}
</script>

<template>
  <div v-if="candidates.length > 0" class="self-craft-block">
    <div class="block-header">
      <div class="block-title">
        <el-tag type="warning" size="small">💡 自製建議</el-tag>
        <el-text size="small" type="info">
          勾選要改為自製的素材，購物清單與製作步驟會自動更新
        </el-text>
      </div>
      <div class="block-stats">
        <el-text size="small" type="success">
          已省下 {{ formatGil(selectedSavings) }}
        </el-text>
        <el-button size="small" @click="toggleAll">
          {{ allSelected ? '全部取消' : '全選' }}
        </el-button>
      </div>
    </div>

    <el-table :data="candidates" size="small" class="suggestions-table">
      <el-table-column label="" width="40" align="center">
        <template #default="{ row }">
          <el-checkbox :model-value="isChecked(row.itemId)" @change="() => toggle(row.itemId)" />
        </template>
      </el-table-column>
      <el-table-column label="" width="36">
        <template #default="{ row }">
          <img v-if="row.icon" :src="row.icon" :alt="row.name" class="row-icon" />
        </template>
      </el-table-column>
      <el-table-column label="素材" prop="name">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.hqRequired" size="small" type="warning" style="margin-left: 4px">需 HQ</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="數量" prop="amount" width="60" align="right" />
      <el-table-column label="買" width="90" align="right">
        <template #default="{ row }">{{ formatGil(row.buyCost) }}</template>
      </el-table-column>
      <el-table-column label="做" width="90" align="right">
        <template #default="{ row }">{{ formatGil(row.craftCost) }}</template>
      </el-table-column>
      <el-table-column label="省" width="100" align="right">
        <template #default="{ row }">
          <el-text type="success" size="small">
            -{{ Math.round(row.savingsRatio * 100) }}%
          </el-text>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.self-craft-block {
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch/SelfCraftSuggestions.vue
git commit -m "feat(ui): add SelfCraftSuggestions component"
```

---

## Task 17: Integrate SelfCraftSuggestions into ShoppingList.vue

**Files:**
- Modify: `src/components/batch/ShoppingList.vue`

- [ ] **Step 1: Replace self-craft-items section and wire suggestions**

In `src/components/batch/ShoppingList.vue`:

1. Update props:

```ts
const props = defineProps<{
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftCandidates: SelfCraftCandidate[]  // renamed from selfCraftItems
  grandTotal: number
}>()
```

Update the `<script>` imports:

```ts
import SelfCraftSuggestions from './SelfCraftSuggestions.vue'
import type { SelfCraftCandidate } from '@/stores/batch'
```

2. In the template, REMOVE the old `<!-- Self-craft -->` block (the `<div v-if="selfCraftItems.length > 0" class="server-group">...</div>` at lines ~178-205).

3. Add at the top of the main content (just below the outer `<div>` opening), before server groups:

```vue
<SelfCraftSuggestions :candidates="selfCraftCandidates" />
```

4. Change the `serverGroups` iteration to iterate over the store's `finalShoppingItems` grouped version. Simplest: create a computed in-component that re-groups by server:

```ts
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
const batch = useBatchStore()

const effectiveServerGroups = computed<ServerGroup[]>(() => {
  const items = batch.finalShoppingItems
  if (items.length === 0) return props.serverGroups
  const map = new Map<string, ServerGroup>()
  for (const it of items) {
    const server = it.server ?? '本伺服器'
    if (!map.has(server)) map.set(server, { server, items: [], subtotal: 0 })
    const g = map.get(server)!
    g.items.push(it)
    g.subtotal += it.unitPrice * it.amount
  }
  return [...map.values()]
})
```

Replace template iteration `v-for="group in serverGroups"` with `v-for="group in effectiveServerGroups"`.

- [ ] **Step 2: Update parent in BatchView.vue**

In `src/views/BatchView.vue`, find the two places (lines ~285 and ~377) that pass `:self-craft-items`. Rename prop binding:

```vue
:self-craft-candidates="batchStore.results.selfCraftCandidates"
```

and remove any `:self-craft-items=...` usages.

- [ ] **Step 3: Run tests & type-check**

Run: `npm test`
Run: `npm run build`
Expected: All tests PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/ShoppingList.vue src/views/BatchView.vue
git commit -m "feat(ui): show self-craft suggestions, drop old selfCraftItems section"
```

---

## Task 18: Wire finalTodoList into TodoList consumers

**Files:**
- Modify: `src/views/BatchView.vue`

- [ ] **Step 1: Replace todoList prop source**

In `src/views/BatchView.vue`, find every `<TodoList :items="batchStore.results.todoList" .../>` (likely appears twice — classic and stepper layouts). Replace with:

```vue
<TodoList :items="batchStore.finalTodoList" ... />
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: PASS.

Manual smoke test (optional but recommended):
1. `npm run dev`
2. Open batch view, add recipes, run batch
3. If candidates appear, toggle checkbox → TodoList should grow with a 半成品 row

- [ ] **Step 3: Commit**

```bash
git add src/views/BatchView.vue
git commit -m "feat(batch): consume finalTodoList in BatchView"
```

---

## Task 19: BatchProgress label for new phase

**Files:**
- Modify: `src/components/batch/BatchProgress.vue`

- [ ] **Step 1: Add phase label**

Find the phase-to-text switch/object in `BatchProgress.vue`. Add:

```ts
'evaluating-self-craft': '評估自製建議',
```

Wherever the existing phases like `'evaluating-buffs'` are mapped. Make sure the `phase` type in the component matches the updated union from Task 13.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/batch/BatchProgress.vue
git commit -m "feat(ui): add label for evaluating-self-craft phase"
```

---

## Task 20: Lower default maxRecursionDepth to 2

**Files:**
- Modify: `src/stores/settings.ts`
- Modify: `src/__tests__/stores/settings.test.ts`

- [ ] **Step 1: Update test**

In `src/__tests__/stores/settings.test.ts`, change:

```ts
expect(store.maxRecursionDepth).toBe(3)
```

to:

```ts
expect(store.maxRecursionDepth).toBe(2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- settings.test`
Expected: FAIL.

- [ ] **Step 3: Update default**

In `src/stores/settings.ts`:

```ts
const maxRecursionDepth = ref(2)
```

- [ ] **Step 4: Run test**

Run: `npm test -- settings.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/settings.ts src/__tests__/stores/settings.test.ts
git commit -m "chore(settings): lower default maxRecursionDepth from 3 to 2"
```

---

## Task 21: End-to-end sanity check and cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

1. `npm run dev` and open the batch view
2. Add 2-3 recipes whose sub-materials are likely buyable & craftable (e.g. lumber-based recipes)
3. Enable 遞迴查價 in 計算設定
4. Click 批次計算
5. Verify:
   - Progress bar passes through "評估自製建議" phase
   - If any candidates appear, the 自製建議 region shows at the top of 購物清單
   - Clicking checkbox removes the bought item, adds raw materials, and a 半成品 row appears in 製作步驟
   - Total cost at the bottom drops

If no candidates appear:
- Try recipes with well-known craftable intermediates (e.g. 絲綢 → 藍絲絨 → 鎧領 chain from endgame)
- Lower threshold temporarily in `bom-calculator.ts` (`SELF_CRAFT_SAVINGS_THRESHOLD = 0.01`) to validate plumbing, then revert

- [ ] **Step 4: Confirm and (optional) push**

Do NOT run `git tag` — the user has a strict no-deploy-without-asking policy. Stop here and report back.

```bash
git log --oneline origin/main..HEAD
```

Expected: Shows all commits from Tasks 1-20.

---

## Testing Strategy Summary

- **Unit**: `bom-calculator`, `self-craft-candidates`, `batch` store computeds — mocked API/solver
- **Integration**: `batch-optimizer.test.ts` — verifies orchestrator is called with correct args
- **Manual UI smoke**: End-to-end batch flow in dev server (Task 21)

## Rollback Plan

If anything goes wrong after merging:
- Each task commits independently → bisect-friendly
- The flag is `settings.recursivePricing` — disabling it (UI toggle) skips the entire new path
- `SELF_CRAFT_SAVINGS_THRESHOLD` can be set very high (e.g. 1.0) to suppress all candidates without touching code paths
