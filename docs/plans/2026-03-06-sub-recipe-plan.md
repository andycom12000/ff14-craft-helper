# Sub-Recipe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓材料清單自動遞迴展開可製作的材料，使用者可切換「製作/購買」，並支援將 sub-recipe 加入模擬佇列。

**Architecture:** 擴充 XIVAPI 增加按名稱查配方功能 → 改寫 bom-calculator 為遞迴展開 → 在材料樹加入 collapsed 切換 → recipe store 新增模擬佇列 → 模擬器支援佇列切換。

**Tech Stack:** Vue 3 + TypeScript, Element Plus, Pinia, Vitest

---

### Task 1: API 層 — 新增 findRecipesByItemName

**Files:**
- Modify: `src/api/xivapi.ts`

**Step 1: 新增 findRecipesByItemName 函式**

在 `src/api/xivapi.ts` 的 `searchRecipes` 函式後方新增：

```ts
/**
 * Find recipes that produce a specific item by exact name match.
 * Returns empty array if the item is not craftable.
 */
export async function findRecipesByItemName(
  itemName: string,
  itemId: number,
): Promise<{ recipeId: number; job: string }[]> {
  try {
    const url = `${API_BASE}/recipe_table?page_id=0&search_name=${encodeURIComponent(itemName)}`
    const response = await fetch(url)
    if (!response.ok) return []

    const data: RecipeTableResponse = await response.json()
    // Filter by exact item_id match to avoid partial name matches
    return data.data
      .filter((r) => r.item_id === itemId)
      .map((r) => ({ recipeId: r.id, job: r.job }))
  } catch {
    return []
  }
}
```

**Step 2: 驗證**

```bash
npx vitest run --reporter=verbose 2>&1 | head -30
```

確認現有測試不受影響。

**Step 3: Commit**

```bash
git add src/api/xivapi.ts
git commit -m "feat: add findRecipesByItemName API for sub-recipe lookup"
```

---

### Task 2: BOM Calculator — 遞迴展開材料樹

**Files:**
- Modify: `src/services/bom-calculator.ts`

**Step 1: 新增配方查詢快取與遞迴邏輯**

重寫 `buildMaterialTree`，加入遞迴展開：

```ts
import { getRecipe, findRecipesByItemName } from '@/api/xivapi'
import type { BomTarget, MaterialNode, FlatMaterial } from '@/stores/bom'

const recipeCache = new Map<number, Awaited<ReturnType<typeof getRecipe>>>()
const recipeByItemCache = new Map<number, { recipeId: number; job: string } | null>()

const RAW_ITEM_ID_THRESHOLD = 20000
const MAX_RECURSION_DEPTH = 10

/**
 * Look up the first recipe that produces this item.
 * Returns null if the item is not craftable.
 * Results are cached by itemId.
 */
async function findFirstRecipe(
  itemId: number,
  itemName: string,
): Promise<{ recipeId: number; job: string } | null> {
  if (recipeByItemCache.has(itemId)) {
    return recipeByItemCache.get(itemId)!
  }
  if (itemId < RAW_ITEM_ID_THRESHOLD) {
    recipeByItemCache.set(itemId, null)
    return null
  }
  const results = await findRecipesByItemName(itemName, itemId)
  const first = results.length > 0 ? results[0] : null
  recipeByItemCache.set(itemId, first)
  return first
}

/**
 * Recursively expand a single ingredient node.
 */
async function expandNode(
  itemId: number,
  name: string,
  icon: string,
  amount: number,
  depth: number,
  ancestorIds: Set<number>,
): Promise<MaterialNode> {
  // Stop conditions: max depth, cycle detection, or crystal/base material
  if (depth >= MAX_RECURSION_DEPTH || ancestorIds.has(itemId) || itemId < RAW_ITEM_ID_THRESHOLD) {
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
      expandNode(
        ing.itemId,
        ing.name,
        ing.icon,
        ing.amount * amount,
        depth + 1,
        newAncestors,
      ),
    ),
  )

  return {
    itemId,
    name,
    icon,
    amount,
    recipeId: recipeInfo.recipeId,
    children,
  }
}

export async function buildMaterialTree(
  targets: BomTarget[],
): Promise<MaterialNode[]> {
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const recipe = await fetchRecipeCached(target.recipeId)
      const ancestorIds = new Set([target.itemId])

      const children = await Promise.all(
        recipe.ingredients.map((ing) =>
          expandNode(
            ing.itemId,
            ing.name,
            ing.icon,
            ing.amount * target.quantity,
            1,
            ancestorIds,
          ),
        ),
      )

      return {
        itemId: target.itemId,
        name: target.name,
        icon: target.icon,
        amount: target.quantity,
        recipeId: target.recipeId,
        children,
      } as MaterialNode
    }),
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    console.error(`[BOM] Failed to expand recipe ${targets[i].recipeId}:`, result.reason)
    return {
      itemId: targets[i].itemId,
      name: targets[i].name,
      icon: targets[i].icon,
      amount: targets[i].quantity,
      recipeId: targets[i].recipeId,
    }
  })
}
```

**Step 2: 更新 flattenMaterialTree 支援 collapsed**

```ts
export function flattenMaterialTree(tree: MaterialNode[]): FlatMaterial[] {
  const map = new Map<number, FlatMaterial>()

  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      const hasExpandedChildren = node.children && node.children.length > 0 && !node.collapsed
      if (hasExpandedChildren) {
        // Craftable intermediate that user wants to craft
        upsert(map, node, false)
        walk(node.children!)
      } else {
        // Leaf node, collapsed node, or raw material — treat as purchasable
        const isRaw = !node.recipeId || node.itemId < RAW_ITEM_ID_THRESHOLD || !!node.collapsed
        upsert(map, node, isRaw)
      }
    }
  }

  walk(tree)
  return Array.from(map.values())
}
```

**Step 3: 匯出 clearRecipeByItemCache 用於測試**

```ts
export function clearCaches() {
  recipeCache.clear()
  recipeByItemCache.clear()
}
```

**Step 4: 驗證**

```bash
npx vitest run --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/services/bom-calculator.ts
git commit -m "feat: recursive sub-recipe expansion in buildMaterialTree"
```

---

### Task 3: MaterialNode 新增 collapsed 欄位

**Files:**
- Modify: `src/stores/bom.ts`

**Step 1: 在 MaterialNode 介面新增 collapsed**

```ts
export interface MaterialNode {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId?: number
  children?: MaterialNode[]
  collapsed?: boolean  // true = user chose to buy instead of craft
}
```

**Step 2: 在 bomStore 新增 toggleCollapsed + recalcFlat**

```ts
function toggleCollapsed(node: MaterialNode) {
  node.collapsed = !node.collapsed
}

function recalcFlat() {
  flatMaterials.value = flattenMaterialTree(materialTree.value)
}
```

在 return 中加入 `toggleCollapsed` 和 `recalcFlat`。

import `flattenMaterialTree` from `@/services/bom-calculator`。

**Step 3: Commit**

```bash
git add src/stores/bom.ts
git commit -m "feat: add collapsed toggle and recalcFlat to bom store"
```

---

### Task 4: 材料樹 UI — 收合/展開按鈕

**Files:**
- Modify: `src/components/bom/BomMaterialTree.vue`
- Modify: `src/views/BomView.vue`

**Step 1: 更新 BomMaterialTree.vue**

新增 emit `toggle-collapsed`，新增「改為購買」/「改為製作」按鈕：

```vue
<script setup lang="ts">
import type { MaterialNode } from '@/stores/bom'

defineProps<{
  tree: MaterialNode[]
}>()

const emit = defineEmits<{
  'simulate-recipe': [recipeId: number]
  'toggle-collapsed': [node: MaterialNode]
}>()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span class="card-title">材料樹狀圖</span>
    </template>

    <el-empty v-if="tree.length === 0" description="尚未計算" :image-size="80" />

    <el-tree
      v-else
      :data="tree"
      :props="{ label: 'name', children: 'children' }"
      default-expand-all
      :expand-on-click-node="false"
    >
      <template #default="{ data }">
        <div class="tree-node">
          <img :src="data.icon" :alt="data.name" class="node-icon" />
          <span class="node-name" :class="{ 'node-collapsed': data.collapsed }">
            {{ data.name }}
          </span>
          <el-tag size="small" type="info" class="node-amount">
            x{{ data.amount }}
          </el-tag>
          <template v-if="data.recipeId">
            <el-button
              :type="data.collapsed ? 'success' : 'warning'"
              size="small"
              text
              @click.stop="emit('toggle-collapsed', data)"
            >
              {{ data.collapsed ? '改為製作' : '改為購買' }}
            </el-button>
            <el-button
              type="primary"
              size="small"
              text
              class="node-simulate"
              @click.stop="emit('simulate-recipe', data.recipeId)"
            >
              加入模擬佇列
            </el-button>
          </template>
        </div>
      </template>
    </el-tree>
  </el-card>
</template>
```

新增 CSS：

```css
.node-collapsed {
  text-decoration: line-through;
  opacity: 0.6;
}
```

**Step 2: 更新 BomView.vue 處理 toggle-collapsed**

在 `BomView.vue` 加入：

```ts
function handleToggleCollapsed(node: MaterialNode) {
  bomStore.toggleCollapsed(node)
  bomStore.recalcFlat()
  // Re-fetch prices for any new materials
  fetchPrices(bomStore.flatMaterials.map(m => m.itemId))
}
```

Template 中：

```vue
<BomMaterialTree
  :tree="bomStore.materialTree"
  @simulate-recipe="handleSimulateRecipe"
  @toggle-collapsed="handleToggleCollapsed"
/>
```

**Step 3: Commit**

```bash
git add src/components/bom/BomMaterialTree.vue src/views/BomView.vue
git commit -m "feat: add buy/craft toggle buttons in material tree"
```

---

### Task 5: Recipe Store — 模擬佇列

**Files:**
- Modify: `src/stores/recipe.ts`

**Step 1: 新增 simulationQueue 和相關方法**

```ts
export const useRecipeStore = defineStore('recipe', () => {
  const currentRecipe = ref<Recipe | null>(null)
  const simulationQueue = ref<Recipe[]>([])

  function setRecipe(recipe: Recipe) {
    currentRecipe.value = recipe
  }

  function clearRecipe() {
    currentRecipe.value = null
  }

  function addToQueue(recipe: Recipe) {
    // Avoid duplicates
    if (simulationQueue.value.some(r => r.id === recipe.id)) return
    simulationQueue.value.push(recipe)
  }

  function removeFromQueue(recipeId: number) {
    simulationQueue.value = simulationQueue.value.filter(r => r.id !== recipeId)
  }

  function clearQueue() {
    simulationQueue.value = []
  }

  return {
    currentRecipe,
    simulationQueue,
    setRecipe,
    clearRecipe,
    addToQueue,
    removeFromQueue,
    clearQueue,
  }
})
```

**Step 2: Commit**

```bash
git add src/stores/recipe.ts
git commit -m "feat: add simulation queue to recipe store"
```

---

### Task 6: BomView — 加入模擬佇列邏輯

**Files:**
- Modify: `src/views/BomView.vue`

**Step 1: 修改 handleSimulateRecipe**

原本是直接跳轉模擬器，改為加入佇列：

```ts
async function handleSimulateRecipe(recipeId: number) {
  try {
    const recipe = await getRecipe(recipeId)
    recipeStore.addToQueue(recipe)
    ElMessage.success(`已將「${recipe.name}」加入模擬佇列`)
  } catch (err) {
    console.error('[BOM] Failed to load recipe for queue:', err)
    ElMessage.error('載入配方失敗')
  }
}
```

**Step 2: Commit**

```bash
git add src/views/BomView.vue
git commit -m "feat: material tree simulate button adds to queue instead of navigating"
```

---

### Task 7: 模擬器 — 佇列選擇器

**Files:**
- Modify: `src/views/SimulatorView.vue`

**Step 1: 新增佇列選擇 UI**

在模擬器的 info-section 區塊新增佇列選擇器：

```vue
<!-- Queue selector (shown when queue has items) -->
<el-card v-if="recipeStore.simulationQueue.length > 0" shadow="never" class="queue-card">
  <template #header>
    <div class="queue-header">
      <span>模擬佇列</span>
      <el-button size="small" text type="danger" @click="recipeStore.clearQueue()">清空佇列</el-button>
    </div>
  </template>
  <div class="queue-items">
    <div
      v-for="queueRecipe in recipeStore.simulationQueue"
      :key="queueRecipe.id"
      class="queue-item"
      :class="{ active: recipe?.id === queueRecipe.id }"
      @click="recipeStore.setRecipe(queueRecipe)"
    >
      <img :src="queueRecipe.icon" class="queue-icon" />
      <span>{{ queueRecipe.name }}</span>
      <el-tag size="small" type="info">{{ queueRecipe.job }}</el-tag>
      <el-button
        size="small"
        text
        type="danger"
        class="queue-remove"
        @click.stop="recipeStore.removeFromQueue(queueRecipe.id)"
      >
        移除
      </el-button>
    </div>
  </div>
</el-card>
```

**Step 2: 新增樣式**

```css
.queue-card {
  margin-bottom: 16px;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.queue-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
}

.queue-item:hover {
  background-color: var(--el-fill-color-light);
}

.queue-item.active {
  background-color: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
}

.queue-icon {
  width: 24px;
  height: 24px;
}

.queue-remove {
  margin-left: auto;
}
```

**Step 3: Commit**

```bash
git add src/views/SimulatorView.vue
git commit -m "feat: add simulation queue selector in simulator view"
```

---

### Task 8: Loading 進度顯示

**Files:**
- Modify: `src/views/BomView.vue`

**Step 1: 新增展開進度狀態**

目前計算中只顯示「正在計算材料需求...」，遞迴展開可能耗時更長。在 loading 區塊改為顯示更詳細的訊息：

```ts
const loadingMessage = ref('正在計算材料需求...')
```

在 `handleCalculate` 中：

```ts
loadingMessage.value = '正在展開子配方...'
const tree = await buildMaterialTree(bomStore.targets)
loadingMessage.value = '正在整理材料清單...'
```

Template 中用 `loadingMessage` 替換固定文字。

**Step 2: Commit**

```bash
git add src/views/BomView.vue
git commit -m "feat: show detailed loading message during sub-recipe expansion"
```

---

### Task 9: 單元測試

**Files:**
- Create: `src/__tests__/api/xivapi-findRecipes.test.ts`
- Modify: `src/__tests__/services/bom-calculator.test.ts`
- Create: `src/__tests__/stores/recipe-queue.test.ts`

**Step 1: 測試 findRecipesByItemName**

```ts
// src/__tests__/api/xivapi-findRecipes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findRecipesByItemName } from '@/api/xivapi'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('findRecipesByItemName', () => {
  it('returns recipes matching exact item_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 43, item_id: 5057, item_name: '黑鐵錠', job: '鍛造' },
          { id: 189, item_id: 5057, item_name: '黑鐵錠', job: '甲冑' },
        ],
        p: 1,
      }),
    } as Response)

    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ recipeId: 43, job: '鍛造' })
  })

  it('returns empty array for non-craftable items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], p: 0 }),
    } as Response)

    const results = await findRecipesByItemName('鐵礦', 5111)
    expect(results).toHaveLength(0)
  })

  it('filters out partial name matches with wrong item_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 43, item_id: 5057, item_name: '黑鐵錠', job: '鍛造' },
          { id: 99, item_id: 9999, item_name: '黑鐵錠鑄塊', job: '鍛造' },
        ],
        p: 1,
      }),
    } as Response)

    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(1)
    expect(results[0].recipeId).toBe(43)
  })
})
```

**Step 2: 測試 flattenMaterialTree 支援 collapsed**

在 `src/__tests__/services/bom-calculator.test.ts` 新增：

```ts
describe('flattenMaterialTree with collapsed', () => {
  it('treats collapsed nodes as raw materials', () => {
    const tree: MaterialNode[] = [{
      itemId: 1, name: 'Product', icon: '', amount: 1, recipeId: 100,
      children: [{
        itemId: 2, name: 'Sub-product', icon: '', amount: 2, recipeId: 200,
        collapsed: true,
        children: [
          { itemId: 3, name: 'Raw', icon: '', amount: 4 },
        ],
      }],
    }]

    const flat = flattenMaterialTree(tree)
    // Sub-product is collapsed → treated as raw, its children are NOT included
    const subProduct = flat.find(m => m.itemId === 2)
    expect(subProduct).toBeDefined()
    expect(subProduct!.isRaw).toBe(true)

    // Raw (child of collapsed node) should NOT appear
    const raw = flat.find(m => m.itemId === 3)
    expect(raw).toBeUndefined()
  })

  it('expands non-collapsed craftable nodes normally', () => {
    const tree: MaterialNode[] = [{
      itemId: 1, name: 'Product', icon: '', amount: 1, recipeId: 100,
      children: [{
        itemId: 2, name: 'Sub-product', icon: '', amount: 2, recipeId: 200,
        collapsed: false,
        children: [
          { itemId: 3, name: 'Raw', icon: '', amount: 4 },
        ],
      }],
    }]

    const flat = flattenMaterialTree(tree)
    const subProduct = flat.find(m => m.itemId === 2)
    expect(subProduct).toBeDefined()
    expect(subProduct!.isRaw).toBe(false)

    const raw = flat.find(m => m.itemId === 3)
    expect(raw).toBeDefined()
    expect(raw!.isRaw).toBe(true)
  })
})
```

**Step 3: 測試模擬佇列**

```ts
// src/__tests__/stores/recipe-queue.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRecipeStore } from '@/stores/recipe'
import type { Recipe } from '@/stores/recipe'

const mockRecipe = (id: number, name: string): Recipe => ({
  id,
  name,
  icon: '',
  job: '鍛造',
  level: 50,
  stars: 0,
  canHq: true,
  materialQualityFactor: 0,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 50, stars: 0, difficulty: 100, quality: 100,
    durability: 40, suggestedCraftsmanship: 0, progressDivider: 100,
    qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
  },
})

describe('recipe simulation queue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds recipes to queue without duplicates', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.addToQueue(mockRecipe(1, 'A'))  // duplicate
    expect(store.simulationQueue).toHaveLength(2)
  })

  it('removes recipe from queue', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.removeFromQueue(1)
    expect(store.simulationQueue).toHaveLength(1)
    expect(store.simulationQueue[0].id).toBe(2)
  })

  it('clears queue', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.clearQueue()
    expect(store.simulationQueue).toHaveLength(0)
  })
})
```

**Step 4: 執行所有測試**

```bash
npx vitest run --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/__tests__/
git commit -m "test: add tests for findRecipesByItemName, collapsed flatten, and simulation queue"
```

---

### Task 10: TypeScript 編譯驗證

**Step 1: 確認 TypeScript 無錯誤**

```bash
npx vue-tsc -b --noEmit
```

修復任何型別錯誤。

**Step 2: Commit（如有修正）**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors"
```

---

### Task 11: UI 驗證

使用 Chrome DevTools MCP 驗證：

1. 開啟 `/bom` 頁面
2. 加入一個有子配方的製作目標（例如高階裝備）
3. 點擊「計算」→ 確認材料樹有多層展開
4. 確認可製作材料旁有「改為購買」按鈕
5. 點擊「改為購買」→ 確認材料清單即時更新（被收合的材料移到原始素材區）
6. 點擊「改為製作」→ 確認恢復展開
7. 點擊「加入模擬佇列」→ 確認成功訊息
8. 切換到 `/simulator` 頁面 → 確認佇列選擇器顯示
9. 點擊佇列中的配方 → 確認模擬器載入該配方
