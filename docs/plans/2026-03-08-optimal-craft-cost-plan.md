# Optimal Craft Cost & Crafting Price Tree Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the double-counting total cost calculation by implementing recursive optimal buy/craft routing, and add a visual crafting price tree tab.

**Architecture:** Add `computeOptimalCosts()` to `bom-calculator.ts` that recursively compares buy vs craft for each intermediate node. Update `BomSummary` to use the optimal total. Create a new `BomCraftTree.vue` recursive component with CSS flexbox tree layout, shown in a new tab in `BomView`.

**Tech Stack:** Vue 3, TypeScript, Element Plus, CSS flexbox + pseudo-element connectors

---

### Task 1: Add `computeOptimalCosts` to bom-calculator

**Files:**
- Modify: `src/services/bom-calculator.ts`
- Test: `src/__tests__/services/bom-calculator.test.ts`

**Step 1: Write the failing tests**

Add to `src/__tests__/services/bom-calculator.test.ts`:

```typescript
import { computeOptimalCosts } from '@/services/bom-calculator'

describe('computeOptimalCosts', () => {
  // Helper: create a simple getUnitPrice function from a price map
  function priceGetter(prices: Record<number, number>) {
    return (itemId: number) => prices[itemId] ?? 0
  }

  it('returns raw material costs for a flat tree (no intermediates)', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        { itemId: 1, name: 'Raw A', icon: '', amount: 3 },
        { itemId: 2, name: 'Raw B', icon: '', amount: 2 },
      ],
    }]
    const getUnitPrice = priceGetter({ 1: 100, 2: 200, 100: 5000 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    // 3*100 + 2*200 = 700
    expect(result.totalCost).toBe(700)
    expect(result.decisions).toHaveLength(0) // no intermediates
  })

  it('picks crafting when cheaper than buying intermediate', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        {
          itemId: 50, name: 'Intermediate', icon: '', amount: 2, recipeId: 5,
          children: [
            { itemId: 1, name: 'Raw A', icon: '', amount: 4 },
          ],
        },
      ],
    }]
    // Intermediate buy = 2*500 = 1000, craft = 4*100 = 400
    const getUnitPrice = priceGetter({ 1: 100, 50: 500, 100: 9999 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    expect(result.totalCost).toBe(400)
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].recommendation).toBe('craft')
    expect(result.decisions[0].craftCost).toBe(400)
    expect(result.decisions[0].buyCost).toBe(1000)
  })

  it('picks buying when cheaper than crafting intermediate', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        {
          itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
          children: [
            { itemId: 1, name: 'Raw A', icon: '', amount: 10 },
          ],
        },
      ],
    }]
    // Intermediate buy = 1*200 = 200, craft = 10*100 = 1000
    const getUnitPrice = priceGetter({ 1: 100, 50: 200, 100: 9999 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    expect(result.totalCost).toBe(200)
    expect(result.decisions[0].recommendation).toBe('buy')
  })

  it('handles nested intermediates recursively', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        {
          itemId: 50, name: 'Mid A', icon: '', amount: 1, recipeId: 5,
          children: [
            {
              itemId: 30, name: 'Mid B', icon: '', amount: 2, recipeId: 3,
              children: [
                { itemId: 1, name: 'Raw', icon: '', amount: 6 },
              ],
            },
          ],
        },
      ],
    }]
    // Mid B: buy=2*300=600, craft=6*50=300 → craft 300
    // Mid A: buy=1*500=500, craft=300(Mid B optimal) → craft 300
    const getUnitPrice = priceGetter({ 1: 50, 30: 300, 50: 500, 100: 9999 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    expect(result.totalCost).toBe(300)
    const midA = result.decisions.find(d => d.itemId === 50)
    expect(midA!.recommendation).toBe('craft')
    const midB = result.decisions.find(d => d.itemId === 30)
    expect(midB!.recommendation).toBe('craft')
  })

  it('forces craft when buy price is 0 (not on market)', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        {
          itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
          children: [
            { itemId: 1, name: 'Raw', icon: '', amount: 3 },
          ],
        },
      ],
    }]
    const getUnitPrice = priceGetter({ 1: 100, 50: 0 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    expect(result.totalCost).toBe(300)
    expect(result.decisions[0].recommendation).toBe('craft')
  })

  it('handles multiple children with mixed buy/craft decisions', () => {
    const tree: MaterialNode[] = [{
      itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
      children: [
        {
          itemId: 50, name: 'Cheap to buy', icon: '', amount: 1, recipeId: 5,
          children: [
            { itemId: 1, name: 'Expensive raw', icon: '', amount: 10 },
          ],
        },
        {
          itemId: 60, name: 'Cheap to craft', icon: '', amount: 1, recipeId: 6,
          children: [
            { itemId: 2, name: 'Cheap raw', icon: '', amount: 2 },
          ],
        },
        { itemId: 3, name: 'Raw C', icon: '', amount: 5 },
      ],
    }]
    // Item 50: buy=1*100=100, craft=10*500=5000 → buy 100
    // Item 60: buy=1*1000=1000, craft=2*10=20 → craft 20
    // Item 3: 5*30=150
    // Total = 100 + 20 + 150 = 270
    const getUnitPrice = priceGetter({ 1: 500, 2: 10, 3: 30, 50: 100, 60: 1000 })
    const result = computeOptimalCosts(tree, getUnitPrice)

    expect(result.totalCost).toBe(270)
    const d50 = result.decisions.find(d => d.itemId === 50)
    expect(d50!.recommendation).toBe('buy')
    const d60 = result.decisions.find(d => d.itemId === 60)
    expect(d60!.recommendation).toBe('craft')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/bom-calculator.test.ts`
Expected: FAIL — `computeOptimalCosts` is not exported

**Step 3: Implement `computeOptimalCosts`**

Add to the bottom of `src/services/bom-calculator.ts` (before `clearCaches`):

```typescript
export interface CostDecision {
  itemId: number
  name: string
  icon: string
  amount: number
  buyCost: number
  craftCost: number
  optimalCost: number
  recommendation: 'buy' | 'craft'
}

export interface OptimalCostResult {
  totalCost: number
  decisions: CostDecision[]
}

/**
 * Recursively compute optimal costs for each node in the material tree.
 * For each intermediate, compares buying vs crafting from children and picks the cheaper option.
 *
 * @param tree - The material tree (from buildMaterialTree)
 * @param getUnitPrice - Function that returns the unit price for an itemId
 * @returns totalCost (sum of optimal costs for root children) and per-intermediate decisions
 */
export function computeOptimalCosts(
  tree: MaterialNode[],
  getUnitPrice: (itemId: number) => number,
): OptimalCostResult {
  const decisionsMap = new Map<number, CostDecision>()

  function getNodeOptimalCost(node: MaterialNode): number {
    const unitPrice = getUnitPrice(node.itemId)
    const buyCost = unitPrice * node.amount

    // Leaf node, collapsed, or crystal — must buy
    if (
      !node.children || node.children.length === 0 ||
      node.collapsed ||
      node.itemId < RAW_ITEM_ID_THRESHOLD
    ) {
      return buyCost
    }

    // Intermediate — compare buy vs craft
    const craftCost = node.children.reduce(
      (sum, child) => sum + getNodeOptimalCost(child), 0,
    )

    let recommendation: 'buy' | 'craft'
    let optimalCost: number

    if (buyCost <= 0) {
      // Not available to buy, must craft
      recommendation = 'craft'
      optimalCost = craftCost
    } else if (craftCost <= 0) {
      // Can't determine craft cost, buy
      recommendation = 'buy'
      optimalCost = buyCost
    } else if (buyCost <= craftCost) {
      recommendation = 'buy'
      optimalCost = buyCost
    } else {
      recommendation = 'craft'
      optimalCost = craftCost
    }

    // Accumulate decisions by itemId (same item may appear in multiple branches)
    const existing = decisionsMap.get(node.itemId)
    if (existing) {
      existing.amount += node.amount
      existing.buyCost += buyCost
      existing.craftCost += craftCost
      existing.optimalCost += optimalCost
    } else {
      decisionsMap.set(node.itemId, {
        itemId: node.itemId,
        name: node.name,
        icon: node.icon,
        amount: node.amount,
        buyCost,
        craftCost,
        optimalCost,
        recommendation,
      })
    }

    return optimalCost
  }

  // Sum optimal costs of each root's children (roots are the targets themselves)
  let totalCost = 0
  for (const root of tree) {
    if (root.children && root.children.length > 0) {
      for (const child of root.children) {
        totalCost += getNodeOptimalCost(child)
      }
    }
  }

  return {
    totalCost,
    decisions: Array.from(decisionsMap.values()),
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/bom-calculator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/services/bom-calculator.ts src/__tests__/services/bom-calculator.test.ts
git commit -m "feat: add computeOptimalCosts for buy-vs-craft routing"
```

---

### Task 2: Update BomSummary to use optimal cost

**Files:**
- Modify: `src/components/bom/BomSummary.vue`

**Step 1: Add `materialTree` prop and compute optimal costs**

In `BomSummary.vue` `<script setup>`:

- Add import: `import { computeOptimalCosts, type CostDecision } from '@/services/bom-calculator'`
- Add import: `import type { MaterialNode } from '@/stores/bom'`
- Add to props: `materialTree?: MaterialNode[]`
- Add computed for optimal cost result:

```typescript
const optimalResult = computed(() => {
  if (!props.materialTree || props.materialTree.length === 0) return null
  return computeOptimalCosts(props.materialTree, getUnitPrice)
})

const decisionsMap = computed(() => {
  const map = new Map<number, CostDecision>()
  if (optimalResult.value) {
    for (const d of optimalResult.value.decisions) {
      map.set(d.itemId, d)
    }
  }
  return map
})
```

**Step 2: Replace grandTotal with optimal cost**

Change `grandTotal` computed:

```typescript
const grandTotal = computed(() => {
  if (optimalResult.value) return optimalResult.value.totalCost
  // Fallback when no tree provided: use raw total only
  return rawTotalCost.value
})
```

**Step 3: Update intermediates table to show buy/craft comparison**

In the craftable materials `<el-table>`, add two new columns after the "小計" column:

```html
<el-table-column label="材料成本" width="120" align="right">
  <template #default="{ row }">
    <template v-if="decisionsMap.get(row.itemId)">
      {{ formatGil(decisionsMap.get(row.itemId)!.craftCost) }}
    </template>
    <template v-else>-</template>
  </template>
</el-table-column>
<el-table-column label="建議" width="120" align="center">
  <template #default="{ row }">
    <template v-if="decisionsMap.get(row.itemId)">
      <el-tag
        :type="decisionsMap.get(row.itemId)!.recommendation === 'craft' ? 'success' : 'warning'"
        size="small"
      >
        {{ decisionsMap.get(row.itemId)!.recommendation === 'craft' ? '自製較省' : '直購較省' }}
      </el-tag>
    </template>
  </template>
</el-table-column>
```

Also rename the existing "小計" column header to "直購成本" for clarity in the intermediates table.

**Step 4: Update grand total label**

Change the grand total display text from `自製成本` to `最優製作成本`:

```html
<div class="grand-total">
  最優製作成本：<strong>{{ formatGil(grandTotal) }}</strong> Gil
</div>
```

**Step 5: Verify in dev**

Run: `npm run dev`
Expected: BomSummary shows correct optimal cost, intermediates show buy/craft recommendations. Note: until callers pass `materialTree`, it falls back to `rawTotalCost`.

**Step 6: Commit**

```bash
git add src/components/bom/BomSummary.vue
git commit -m "fix: use optimal buy/craft routing for total cost calculation"
```

---

### Task 3: Wire materialTree prop in callers

**Files:**
- Modify: `src/views/BomView.vue`
- Modify: `src/components/simulator/CraftRecommendation.vue`

**Step 1: Update BomView.vue**

Add `:material-tree="bomStore.materialTree"` to the `<BomSummary>` tag (line 130-135):

```html
<BomSummary
  v-else
  :materials="bomStore.flatMaterials"
  :prices="bomStore.prices"
  :material-tree="bomStore.materialTree"
  @refresh-prices="handleRefreshPrices"
/>
```

**Step 2: Update CraftRecommendation.vue**

Add a `materialTree` ref to store the tree built in `loadBom()`.

After `const flatMaterials = ref<FlatMaterial[]>([])` (line 42), add:

```typescript
import type { MaterialNode } from '@/stores/bom'
const bomTree = ref<MaterialNode[]>([])
```

In `loadBom()`, store the tree (after line 101 `const tree = await buildMaterialTree(targets)`):

```typescript
bomTree.value = tree
```

In `loadBom()` reset (line 89):

```typescript
bomTree.value = []
```

Update the `<BomSummary>` tag (line 202) to pass the tree:

```html
<BomSummary
  v-else-if="flatMaterials.length > 0"
  :materials="flatMaterials"
  :prices="prices"
  :target-item-ids="[recipe!.itemId]"
  :material-tree="bomTree"
  @refresh-prices="refreshPrices"
/>
```

**Step 3: Verify in dev**

Run: `npm run dev`
Expected: Both BomView and CraftRecommendation pass the tree, optimal costs display correctly.

**Step 4: Commit**

```bash
git add src/views/BomView.vue src/components/simulator/CraftRecommendation.vue
git commit -m "feat: pass materialTree to BomSummary for optimal cost calculation"
```

---

### Task 4: Create BomCraftTree visual component

**Files:**
- Create: `src/components/bom/BomCraftTree.vue`

**Step 1: Create the recursive tree component**

Create `src/components/bom/BomCraftTree.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialNode, PriceInfo } from '@/stores/bom'
import { getPrice } from '@/stores/bom'
import { computeOptimalCosts, type CostDecision } from '@/services/bom-calculator'
import { useSettingsStore } from '@/stores/settings'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  tree: MaterialNode[]
  prices: Map<number, PriceInfo>
}>()

const settingsStore = useSettingsStore()

function getUnitPrice(itemId: number): number {
  const priceInfo = props.prices.get(itemId)
  if (!priceInfo) return 0
  return getPrice(priceInfo, settingsStore.priceDisplayMode)
}

const optimalResult = computed(() =>
  computeOptimalCosts(props.tree, getUnitPrice),
)

const decisionsMap = computed(() => {
  const map = new Map<number, CostDecision>()
  for (const d of optimalResult.value.decisions) {
    map.set(d.itemId, d)
  }
  return map
})

// Compute optimal cost for each node (for display in the tree)
function getNodeDisplayInfo(node: MaterialNode): {
  unitPrice: number
  buyCost: number
  craftCost: number | null
  recommendation: 'buy' | 'craft' | null
  saving: number
  isIntermediate: boolean
} {
  const unitPrice = getUnitPrice(node.itemId)
  const buyCost = unitPrice * node.amount
  const hasChildren = node.children && node.children.length > 0 && !node.collapsed

  if (!hasChildren) {
    return { unitPrice, buyCost, craftCost: null, recommendation: null, saving: 0, isIntermediate: false }
  }

  const decision = decisionsMap.value.get(node.itemId)
  if (decision) {
    const saving = Math.abs(decision.buyCost - decision.craftCost)
    return {
      unitPrice,
      buyCost: decision.buyCost,
      craftCost: decision.craftCost,
      recommendation: decision.recommendation,
      saving,
      isIntermediate: true,
    }
  }

  return { unitPrice, buyCost, craftCost: null, recommendation: null, saving: 0, isIntermediate: true }
}

// Target buy price (direct purchase of finished product)
const targetBuyPrice = computed(() => {
  return props.tree.reduce((sum, root) => {
    return sum + getUnitPrice(root.itemId) * root.amount
  }, 0)
})
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="tree-header">
        <span class="card-title">
          製作價格樹
          <el-tag size="small" type="info" style="margin-left: 8px">
            {{ settingsStore.server }}
          </el-tag>
        </span>
      </div>
    </template>

    <el-empty v-if="tree.length === 0" description="尚未計算" :image-size="80" />

    <div v-else class="tree-scroll-container">
      <!-- One tree per target -->
      <div v-for="root in tree" :key="root.itemId" class="craft-tree">
        <!-- Root node (target product) -->
        <div class="tree-node-wrapper">
          <div class="tree-node root-node">
            <img v-if="root.icon" :src="root.icon" :alt="root.name" crossorigin="anonymous" class="node-icon" />
            <div class="node-info">
              <span class="node-name">{{ root.name }}</span>
              <span v-if="root.amount > 1" class="node-qty">×{{ root.amount }}</span>
              <div v-if="getUnitPrice(root.itemId) > 0" class="node-price">
                {{ formatGil(getUnitPrice(root.itemId) * root.amount) }}
              </div>
            </div>
          </div>

          <!-- Summary decision box -->
          <div v-if="optimalResult.totalCost > 0" class="decision-box summary-box" :class="optimalResult.totalCost < targetBuyPrice ? 'recommend-craft' : 'recommend-buy'">
            <div class="decision-label">以最優路線計算（每項材料取買/製的較低價）</div>
            <div class="decision-compare">
              最優製作: <strong>{{ formatGil(optimalResult.totalCost) }}</strong>
              <template v-if="targetBuyPrice > 0">
                vs 直購成品: <strong>{{ formatGil(targetBuyPrice) }}</strong>
              </template>
            </div>
            <div v-if="targetBuyPrice > 0" class="decision-verdict">
              <template v-if="optimalResult.totalCost < targetBuyPrice">
                建議自製，省 {{ formatGil(targetBuyPrice - optimalResult.totalCost) }}
              </template>
              <template v-else-if="optimalResult.totalCost > targetBuyPrice">
                建議直購，省 {{ formatGil(optimalResult.totalCost - targetBuyPrice) }}
              </template>
              <template v-else>費用相同</template>
            </div>
          </div>
        </div>

        <!-- Children container -->
        <div v-if="root.children && root.children.length > 0" class="tree-children">
          <div
            v-for="child in root.children"
            :key="child.itemId"
            class="tree-branch"
          >
            <!-- Recursive subtree -->
            <div class="tree-node-wrapper">
              <div
                class="tree-node"
                :class="{
                  'material-node': !child.children || child.children.length === 0,
                  'intermediate-node': child.children && child.children.length > 0,
                }"
              >
                <img v-if="child.icon" :src="child.icon" :alt="child.name" crossorigin="anonymous" class="node-icon" />
                <div class="node-info">
                  <span v-if="child.amount > 1" class="node-qty-badge">{{ child.amount }}</span>
                  <span class="node-name">{{ child.name }}</span>
                  <div v-if="getUnitPrice(child.itemId) > 0" class="node-price">
                    {{ formatGil(getUnitPrice(child.itemId) * child.amount) }}
                  </div>
                </div>
              </div>

              <!-- Decision box for intermediates -->
              <div
                v-if="getNodeDisplayInfo(child).isIntermediate && getNodeDisplayInfo(child).craftCost !== null"
                class="decision-box"
                :class="getNodeDisplayInfo(child).recommendation === 'craft' ? 'recommend-craft' : 'recommend-buy'"
              >
                <div class="decision-compare">
                  材料: {{ formatGil(getNodeDisplayInfo(child).craftCost!) }}
                  vs
                  <template v-if="child.amount > 1">{{ child.amount }}個</template>成品: {{ formatGil(getNodeDisplayInfo(child).buyCost) }}
                </div>
                <div class="decision-verdict">
                  <template v-if="getNodeDisplayInfo(child).recommendation === 'craft'">
                    自製省 {{ formatGil(getNodeDisplayInfo(child).saving) }}
                  </template>
                  <template v-else>
                    直購省 {{ formatGil(getNodeDisplayInfo(child).saving) }}
                  </template>
                </div>
              </div>
            </div>

            <!-- Grandchildren (raw materials of this intermediate) -->
            <div v-if="child.children && child.children.length > 0 && !child.collapsed" class="tree-children">
              <div
                v-for="grandchild in child.children"
                :key="grandchild.itemId"
                class="tree-branch"
              >
                <div class="tree-node-wrapper">
                  <div
                    class="tree-node"
                    :class="{
                      'material-node': !grandchild.children || grandchild.children.length === 0,
                      'intermediate-node': grandchild.children && grandchild.children.length > 0,
                    }"
                  >
                    <img v-if="grandchild.icon" :src="grandchild.icon" :alt="grandchild.name" crossorigin="anonymous" class="node-icon" />
                    <div class="node-info">
                      <span v-if="grandchild.amount > 1" class="node-qty-badge">{{ grandchild.amount }}</span>
                      <span class="node-name">{{ grandchild.name }}</span>
                      <div v-if="getUnitPrice(grandchild.itemId) > 0" class="node-price">
                        {{ formatGil(getUnitPrice(grandchild.itemId) * grandchild.amount) }}
                      </div>
                    </div>
                  </div>

                  <!-- Decision box for nested intermediates -->
                  <div
                    v-if="getNodeDisplayInfo(grandchild).isIntermediate && getNodeDisplayInfo(grandchild).craftCost !== null"
                    class="decision-box"
                    :class="getNodeDisplayInfo(grandchild).recommendation === 'craft' ? 'recommend-craft' : 'recommend-buy'"
                  >
                    <div class="decision-compare">
                      材料: {{ formatGil(getNodeDisplayInfo(grandchild).craftCost!) }}
                      vs
                      <template v-if="grandchild.amount > 1">{{ grandchild.amount }}個</template>成品: {{ formatGil(getNodeDisplayInfo(grandchild).buyCost) }}
                    </div>
                    <div class="decision-verdict">
                      <template v-if="getNodeDisplayInfo(grandchild).recommendation === 'craft'">
                        自製省 {{ formatGil(getNodeDisplayInfo(grandchild).saving) }}
                      </template>
                      <template v-else>
                        直購省 {{ formatGil(getNodeDisplayInfo(grandchild).saving) }}
                      </template>
                    </div>
                  </div>
                </div>

                <!-- Level 3+ children -->
                <div v-if="grandchild.children && grandchild.children.length > 0 && !grandchild.collapsed" class="tree-children">
                  <div
                    v-for="leaf in grandchild.children"
                    :key="leaf.itemId"
                    class="tree-branch"
                  >
                    <div class="tree-node-wrapper">
                      <div class="tree-node material-node">
                        <img v-if="leaf.icon" :src="leaf.icon" :alt="leaf.name" crossorigin="anonymous" class="node-icon" />
                        <div class="node-info">
                          <span v-if="leaf.amount > 1" class="node-qty-badge">{{ leaf.amount }}</span>
                          <span class="node-name">{{ leaf.name }}</span>
                          <div v-if="getUnitPrice(leaf.itemId) > 0" class="node-price">
                            {{ formatGil(getUnitPrice(leaf.itemId) * leaf.amount) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tree-scroll-container {
  overflow-x: auto;
  padding-bottom: 16px;
}

.craft-tree {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: fit-content;
  padding: 16px;
}

/* ---- Node styles ---- */
.tree-node-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 2px solid var(--el-border-color);
  background: var(--el-bg-color-overlay);
  min-width: 100px;
  text-align: center;
  flex-direction: column;
}

.root-node {
  border-color: var(--el-color-warning);
  border-width: 3px;
}

.material-node {
  border-color: var(--el-border-color-light);
}

.intermediate-node {
  border-color: var(--el-color-info);
}

.node-icon {
  width: 32px;
  height: 32px;
}

.node-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  position: relative;
}

.node-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.node-qty {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.node-qty-badge {
  position: absolute;
  top: -28px;
  right: -20px;
  background: var(--el-color-success);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-price {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

/* ---- Decision box ---- */
.decision-box {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 2px solid;
  font-size: 11px;
  text-align: center;
  max-width: 220px;
}

.summary-box {
  max-width: 360px;
  padding: 10px 16px;
  font-size: 12px;
}

.recommend-craft {
  border-color: var(--el-color-success);
  background: rgba(103, 194, 58, 0.08);
}

.recommend-buy {
  border-color: var(--el-color-warning);
  background: rgba(230, 162, 60, 0.08);
}

.decision-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.decision-compare {
  color: var(--el-text-color-regular);
}

.decision-verdict {
  margin-top: 2px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* ---- Tree connectors ---- */
.tree-children {
  display: flex;
  justify-content: center;
  gap: 0;
  position: relative;
  margin-top: 32px;
  padding-top: 20px;
}

/* Vertical line from parent down to the horizontal rail */
.tree-children::before {
  content: '';
  position: absolute;
  top: -12px;
  left: 50%;
  width: 2px;
  height: 32px;
  background: var(--el-color-success-light-5);
}

/* Horizontal rail connecting all branches */
.tree-children::after {
  content: '';
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--el-color-success-light-5);
}

/* Single child: hide the horizontal rail since it's not needed */
.tree-children:has(> .tree-branch:only-child)::after {
  display: none;
}

.tree-branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: 0 12px;
}

/* Vertical line from horizontal rail down to child node */
.tree-branch::before {
  content: '';
  position: absolute;
  top: -0px;
  left: 50%;
  width: 2px;
  height: 20px;
  background: var(--el-color-success-light-5);
  transform: translateX(-50%);
}

/* Clip horizontal rail to start at first child center and end at last child center */
.tree-branch:first-child {
  padding-left: 12px;
}

.tree-branch:last-child {
  padding-right: 12px;
}
</style>
```

**Step 2: Verify component renders**

Run: `npm run dev`
Expected: No errors. Component is created but not yet integrated.

**Step 3: Commit**

```bash
git add src/components/bom/BomCraftTree.vue
git commit -m "feat: create BomCraftTree visual component"
```

---

### Task 5: Add tabs in BomView

**Files:**
- Modify: `src/views/BomView.vue`

**Step 1: Add tab switching**

Import BomCraftTree and add an `el-tabs` wrapper around BomSummary and the new tree.

Add import:
```typescript
import BomCraftTree from '@/components/bom/BomCraftTree.vue'
```

Add ref:
```typescript
const activeTab = ref('summary')
```

Replace the BomSummary section (lines 125-136) with:

```html
<div class="section-gap">
  <div v-if="fetchingPrices" class="loading-section">
    <el-skeleton :rows="3" animated />
    <p class="loading-text">正在取得市場價格...</p>
  </div>
  <el-tabs v-else v-model="activeTab">
    <el-tab-pane label="材料總覽" name="summary">
      <BomSummary
        :materials="bomStore.flatMaterials"
        :prices="bomStore.prices"
        :material-tree="bomStore.materialTree"
        @refresh-prices="handleRefreshPrices"
      />
    </el-tab-pane>
    <el-tab-pane label="製作價格樹" name="tree">
      <BomCraftTree
        :tree="bomStore.materialTree"
        :prices="bomStore.prices"
      />
    </el-tab-pane>
  </el-tabs>
</div>
```

**Step 2: Verify in dev**

Run: `npm run dev`
Expected: Two tabs appear — "材料總覽" shows the table view, "製作價格樹" shows the visual tree with connectors, decision boxes, and correct optimal costs.

**Step 3: Commit**

```bash
git add src/views/BomView.vue
git commit -m "feat: add crafting price tree tab in BomView"
```

---

### Task 6: Final verification and type check

**Files:**
- None (verification only)

**Step 1: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass including the new `computeOptimalCosts` tests

**Step 3: Manual testing checklist**

1. Go to BomView, add a target with intermediates, click 計算
2. Verify "材料總覽" tab:
   - Grand total shows "最優製作成本" (not the old double-counted value)
   - Intermediates table shows "材料成本" and "建議" columns
   - Each intermediate shows 自製較省 or 直購較省 tag
3. Switch to "製作價格樹" tab:
   - Root node shows product name and price
   - Summary box shows "最優製作: X vs 直購成品: Y"
   - Each intermediate shows decision box with comparison
   - Green border = craft recommended, orange = buy recommended
   - Tree connectors render correctly
4. Go to simulator, trigger CraftRecommendation with a recipe that has intermediates
5. Verify BomSummary in CraftRecommendation also shows correct optimal cost

**Step 4: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
