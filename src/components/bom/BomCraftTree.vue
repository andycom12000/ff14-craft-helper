<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialNode, PriceInfo } from '@/stores/bom'
import { getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { useBatchStore } from '@/stores/batch'
import { computeOptimalCosts } from '@/services/bom-calculator'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'
import BomMaterialRow from '@/components/bom/BomMaterialRow.vue'

const props = defineProps<{
  tree: MaterialNode[]
  prices: Map<number, PriceInfo>
}>()

const emit = defineEmits<{
  'simulate-recipe': [recipeId: number]
  'toggle-collapsed': [node: MaterialNode]
}>()

const settings = useSettingsStore()
const batchStore = useBatchStore()

const CRYSTAL_THRESHOLD = 20
const SHOPPING_TYPE = 'nq'

function isCrystal(node: MaterialNode): boolean {
  return node.itemId < CRYSTAL_THRESHOLD
}

function getNonCrystalChildren(node: MaterialNode): MaterialNode[] {
  return node.children?.filter(c => !isCrystal(c)) ?? []
}

interface CrystalSummary {
  itemId: number
  name: string
  amount: number
}

const allCrystals = computed(() => {
  const map = new Map<number, CrystalSummary>()
  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      if (node.collapsed) {
        continue
      }
      for (const child of node.children ?? []) {
        if (isCrystal(child)) {
          const existing = map.get(child.itemId)
          if (existing) {
            existing.amount += child.amount
          } else {
            map.set(child.itemId, { itemId: child.itemId, name: child.name, amount: child.amount })
          }
        }
      }
      if (node.children) walk(node.children)
    }
  }
  walk(props.tree)
  return Array.from(map.values()).sort((a, b) => a.itemId - b.itemId)
})

const crystalColorTokens = [
  'var(--element-fire)',
  'var(--element-ice)',
  'var(--element-wind)',
  'var(--element-earth)',
  'var(--element-lightning)',
  'var(--element-water)',
]

function getCrystalColor(itemId: number): string {
  return crystalColorTokens[(itemId - 2) % 6]
}

/**
 * Returns null when the market has no data for this item. Also treats a
 * price of 0 as "unknown" since Universalis occasionally returns 0 for items
 * with no qualifying listings. Callers that need a numeric value for
 * arithmetic should use unitPriceOrZero().
 */
function getUnitPrice(itemId: number): number | null {
  const info = props.prices.get(itemId)
  if (!info) return null
  const price = getPrice(info, settings.priceDisplayMode)
  return price > 0 ? price : null
}

function unitPriceOrZero(itemId: number): number {
  return getUnitPrice(itemId) ?? 0
}

function lineTotal(itemId: number, amount: number): number | null {
  const p = getUnitPrice(itemId)
  return p == null ? null : p * amount
}

// Pass getUnitPrice (null-aware) so computeOptimalCosts can treat "unknown"
// distinctly from 0 Gil — prevents the old "建議自製，省 0" false recommendation.
const optimalResult = computed(() =>
  computeOptimalCosts(props.tree, getUnitPrice),
)

const decisionsMap = computed(() => {
  const map = new Map<number, (typeof optimalResult.value.decisions)[0]>()
  for (const d of optimalResult.value.decisions) {
    map.set(d.itemId, d)
  }
  return map
})

interface NodeDisplayInfo {
  buyCost: number
  craftCost: number
  recommendation: 'buy' | 'craft'
  saving: number
}

// Build a node-id → display-info map up-front so the template can do cheap
// lookups instead of recomputing the same comparison 4–8 times per node per
// re-render (was triggering on every price tick for deep trees).
const displayInfoMap = computed(() => {
  const map = new Map<number, NodeDisplayInfo>()
  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0 && node.recipeId && !node.collapsed) {
        const decision = decisionsMap.value.get(node.itemId)
        if (decision) {
          map.set(node.itemId, {
            buyCost: decision.buyCost,
            craftCost: decision.craftCost,
            recommendation: decision.recommendation,
            saving: Math.abs(decision.buyCost - decision.craftCost),
          })
        } else {
          const unitPrice = unitPriceOrZero(node.itemId)
          const buyCost = unitPrice * node.amount
          const craftCost = node.children.reduce(
            (sum, child) => sum + unitPriceOrZero(child.itemId) * child.amount,
            0,
          )
          const recommendation = buyCost > 0 && buyCost <= craftCost ? 'buy' : 'craft'
          map.set(node.itemId, {
            buyCost,
            craftCost,
            recommendation,
            saving: Math.abs(buyCost - craftCost),
          })
        }
      }
      if (node.children) walk(node.children)
    }
  }
  walk(props.tree)
  return map
})

function getNodeDisplayInfo(node: MaterialNode): NodeDisplayInfo | null {
  return displayInfoMap.value.get(node.itemId) ?? null
}

const rootSummary = computed(() => {
  if (props.tree.length === 0) return null
  const root = props.tree[0]
  if (!root.children || root.children.length === 0) return null

  const optimalCraft = optimalResult.value.totalCost
  const unitPrice = unitPriceOrZero(root.itemId)
  const buyDirect = unitPrice * root.amount

  const recommendation = buyDirect > 0 && buyDirect <= optimalCraft ? 'buy' : 'craft'
  const saving = Math.abs(buyDirect - optimalCraft)

  return { optimalCraft, buyDirect, recommendation, saving }
})

/**
 * A "buyable" node in the tree: either a raw material (no recipe),
 * a collapsed craftable (user chose to buy), or a leaf with children stripped.
 * These are the rows where the "✓ 已採購" toggle makes sense.
 */
function isShoppingRow(node: MaterialNode): boolean {
  if (isCrystal(node)) return false
  // Raw / leaf — nothing to craft
  if (!node.recipeId || !node.children || node.children.length === 0) return true
  // Collapsed craftable — user chose to buy rather than craft
  if (node.collapsed) return true
  return false
}

function isNodeChecked(node: MaterialNode): boolean {
  return batchStore.isShoppingChecked(node.itemId, SHOPPING_TYPE, false)
}

function toggleNodeChecked(node: MaterialNode) {
  batchStore.toggleShoppingItem(node.itemId, SHOPPING_TYPE, false)
}

function collectShoppingNodes(nodes: MaterialNode[], out: MaterialNode[] = []): MaterialNode[] {
  for (const node of nodes) {
    if (isShoppingRow(node)) out.push(node)
    if (node.children && node.children.length > 0 && !node.collapsed) {
      collectShoppingNodes(node.children, out)
    }
  }
  return out
}

const allShoppingNodes = computed(() => collectShoppingNodes(props.tree))

const allChecked = computed(() => {
  if (allShoppingNodes.value.length === 0) return false
  return allShoppingNodes.value.every(n => isNodeChecked(n))
})
</script>

<template>
  <el-card shadow="never" class="craft-tree-card">
    <template #header>
      <div class="card-header">
        <span class="card-title">製作價格樹</span>
        <el-tag type="info" size="small">{{ settings.server }}</el-tag>
        <div v-if="allCrystals.length > 0" class="crystal-tags">
          <el-tag
            v-for="c in allCrystals" :key="c.itemId"
            type="info" effect="plain" round size="small"
          >
            <span class="crystal-dot" :style="{ background: getCrystalColor(c.itemId) }" />
            <ItemName :item-id="c.itemId" :fallback="c.name" /> ×{{ c.amount }}
          </el-tag>
        </div>
      </div>
    </template>

    <el-empty v-if="tree.length === 0" description="尚未計算" :image-size="80" />

    <template v-else>

    <div class="tree-scroll-container">
      <div v-for="root in tree" :key="root.itemId" class="tree-root">
        <!-- Root node card -->
        <BomMaterialRow
          :node="root"
          card-variant="root"
          :unit-price="getUnitPrice(root.itemId)"
          :line-total="lineTotal(root.itemId, root.amount)"
          :row-checked="isShoppingRow(root) && isNodeChecked(root)"
        >
          <template v-if="root.recipeId" #actions>
            <el-button type="primary" size="small" text @click="emit('simulate-recipe', root.recipeId!)">
              加入模擬佇列
            </el-button>
          </template>
        </BomMaterialRow>

        <div
          v-if="rootSummary"
          class="decision-box summary-box"
          :class="rootSummary.recommendation === 'craft' ? 'decision-craft' : 'decision-buy'"
        >
          <div class="decision-subtitle">以最優路線計算（每項材料取買/製的較低價）</div>
          <div class="decision-main">
            最優製作: {{ formatGil(rootSummary.optimalCraft) }}
            vs 直購成品: {{ formatGil(rootSummary.buyDirect) }}
          </div>
          <div class="decision-result">
            <template v-if="rootSummary.recommendation === 'craft'">
              建議自製，省 {{ formatGil(rootSummary.saving) }}
            </template>
            <template v-else>
              建議直購，省 {{ formatGil(rootSummary.saving) }}
            </template>
          </div>
        </div>

        <!-- Level 1 children (non-crystal only) -->
        <div
          v-if="getNonCrystalChildren(root).length > 0"
          class="tree-children depth-1"
        >
          <div
            v-for="child in getNonCrystalChildren(root)"
            :key="child.itemId"
            class="tree-branch"
          >
            <div
              v-if="getNodeDisplayInfo(child)"
              class="decision-box node-decision"
              :class="getNodeDisplayInfo(child)!.recommendation === 'craft' ? 'decision-craft' : 'decision-buy'"
            >
              <div class="decision-main">
                材料: {{ formatGil(getNodeDisplayInfo(child)!.craftCost) }}
                vs {{ child.amount }}個成品: {{ formatGil(getNodeDisplayInfo(child)!.buyCost) }}
              </div>
              <div class="decision-result">
                <template v-if="getNodeDisplayInfo(child)!.recommendation === 'craft'">
                  自製省 {{ formatGil(getNodeDisplayInfo(child)!.saving) }}
                </template>
                <template v-else>
                  直購省 {{ formatGil(getNodeDisplayInfo(child)!.saving) }}
                </template>
              </div>
            </div>

            <BomMaterialRow
              :node="child"
              :card-variant="child.recipeId ? 'intermediate' : 'raw'"
              :unit-price="getUnitPrice(child.itemId)"
              :line-total="lineTotal(child.itemId, child.amount)"
              :collapsed="child.collapsed"
              :row-checked="isShoppingRow(child) && isNodeChecked(child)"
            >
              <template #actions>
                <el-button
                  v-if="child.recipeId"
                  :type="child.collapsed ? 'success' : 'warning'"
                  size="small" text
                  @click="emit('toggle-collapsed', child)"
                >
                  {{ child.collapsed ? '改為製作' : '改為購買' }}
                </el-button>
                <el-button
                  v-if="child.recipeId"
                  type="primary" size="small" text
                  @click="emit('simulate-recipe', child.recipeId!)"
                >
                  加入模擬佇列
                </el-button>
                <button
                  v-if="isShoppingRow(child)"
                  type="button"
                  class="shopping-toggle"
                  :class="{ 'is-checked': isNodeChecked(child) }"
                  :aria-pressed="isNodeChecked(child)"
                  @click="toggleNodeChecked(child)"
                >
                  {{ isNodeChecked(child) ? '✓ 已採購' : '加入已採購' }}
                </button>
              </template>
            </BomMaterialRow>

            <!-- Level 2 children (non-crystal only) -->
            <div
              v-if="getNonCrystalChildren(child).length > 0 && !child.collapsed"
              class="tree-children depth-2"
            >
              <div
                v-for="grandchild in getNonCrystalChildren(child)"
                :key="grandchild.itemId"
                class="tree-branch"
              >
                <div
                  v-if="getNodeDisplayInfo(grandchild)"
                  class="decision-box node-decision"
                  :class="getNodeDisplayInfo(grandchild)!.recommendation === 'craft' ? 'decision-craft' : 'decision-buy'"
                >
                  <div class="decision-main">
                    材料: {{ formatGil(getNodeDisplayInfo(grandchild)!.craftCost) }}
                    vs {{ grandchild.amount }}個成品: {{ formatGil(getNodeDisplayInfo(grandchild)!.buyCost) }}
                  </div>
                  <div class="decision-result">
                    <template v-if="getNodeDisplayInfo(grandchild)!.recommendation === 'craft'">
                      自製省 {{ formatGil(getNodeDisplayInfo(grandchild)!.saving) }}
                    </template>
                    <template v-else>
                      直購省 {{ formatGil(getNodeDisplayInfo(grandchild)!.saving) }}
                    </template>
                  </div>
                </div>

                <BomMaterialRow
                  :node="grandchild"
                  :card-variant="grandchild.recipeId ? 'intermediate' : 'raw'"
                  :unit-price="getUnitPrice(grandchild.itemId)"
                  :line-total="lineTotal(grandchild.itemId, grandchild.amount)"
                  :collapsed="grandchild.collapsed"
                  :row-checked="isShoppingRow(grandchild) && isNodeChecked(grandchild)"
                >
                  <template #actions>
                    <el-button
                      v-if="grandchild.recipeId"
                      :type="grandchild.collapsed ? 'success' : 'warning'"
                      size="small" text
                      @click="emit('toggle-collapsed', grandchild)"
                    >
                      {{ grandchild.collapsed ? '改為製作' : '改為購買' }}
                    </el-button>
                    <el-button
                      v-if="grandchild.recipeId"
                      type="primary" size="small" text
                      @click="emit('simulate-recipe', grandchild.recipeId!)"
                    >
                      加入模擬佇列
                    </el-button>
                    <button
                      v-if="isShoppingRow(grandchild)"
                      type="button"
                      class="shopping-toggle"
                      :class="{ 'is-checked': isNodeChecked(grandchild) }"
                      :aria-pressed="isNodeChecked(grandchild)"
                      @click="toggleNodeChecked(grandchild)"
                    >
                      {{ isNodeChecked(grandchild) ? '✓ 已採購' : '加入已採購' }}
                    </button>
                  </template>
                </BomMaterialRow>

                <!-- Level 3 children (non-crystal only) -->
                <div
                  v-if="getNonCrystalChildren(grandchild).length > 0 && !grandchild.collapsed"
                  class="tree-children depth-3"
                >
                  <div
                    v-for="leaf in getNonCrystalChildren(grandchild)"
                    :key="leaf.itemId"
                    class="tree-branch"
                  >
                    <BomMaterialRow
                      :node="leaf"
                      card-variant="raw"
                      :unit-price="getUnitPrice(leaf.itemId)"
                      :line-total="lineTotal(leaf.itemId, leaf.amount)"
                      :row-checked="isShoppingRow(leaf) && isNodeChecked(leaf)"
                    >
                      <template v-if="isShoppingRow(leaf)" #actions>
                        <button
                          type="button"
                          class="shopping-toggle"
                          :class="{ 'is-checked': isNodeChecked(leaf) }"
                          :aria-pressed="isNodeChecked(leaf)"
                          @click="toggleNodeChecked(leaf)"
                        >
                          {{ isNodeChecked(leaf) ? '✓ 已採購' : '加入已採購' }}
                        </button>
                      </template>
                    </BomMaterialRow>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="allChecked" class="all-done-message">
        辛苦了，這趟採買結束 ✨
      </div>
    </Transition>
    </template>
  </el-card>
</template>

<style scoped>
.craft-tree-card {
  --connector-color: var(--el-color-success-light-5);
  --bom-tree-indent: 10px;
}

.card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
}

.tree-scroll-container {
  padding: 16px 0;
  /* Fallback — recipes with >6 children + deep subtrees (e.g. 奶油雞肉寬面)
   * naturally exceed any reasonable max-width. Horizontal scroll is accepted
   * UX for tree diagrams. */
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tree-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--bom-tree-indent);
}

/* Visual separator between sibling recipes on desktop. Deep material branches
 * of the first recipe otherwise butt right up against the second recipe's
 * root card and read as one run-on tree. */
.tree-root + .tree-root {
  margin-top: 40px;
  padding-top: 28px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

/* ---- Node cards ----
 * Compact card: 110px wide, icon + qty + name + one-line price. Actions are
 * stacked below. Matches the card-per-branch sizing used by FFXIV_Market. */
.tree-node-card {
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 6px 6px;
  background: var(--el-bg-color);
  flex: 0 0 auto;
  width: 104px;
  transition: opacity 0.2s var(--ease-out-quart, ease);
}

.root-node {
  border-width: 3px;
  border-color: var(--el-color-warning);
}

.intermediate-node {
  border-color: var(--el-color-info);
}

.raw-node {
  border-color: var(--el-border-color-lighter);
}

.row-checked {
  opacity: 0.45;
}

.row-checked:hover {
  opacity: 0.7;
}

/* Stacked compact card content — icon centered on top, name below, price below. */
.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.node-icon-wrapper {
  position: relative;
  flex-shrink: 0;
}

.node-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
}

.qty-badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--el-color-success);
  color: var(--app-text);
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.node-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
  width: 100%;
}

.node-price-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

.node-price-left {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-align: center;
  line-height: 1.3;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  width: 100%;
}

.node-price-right {
  font-size: 10.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: center;
}

.name-collapsed {
  text-decoration: line-through;
}

.node-collapsed-card {
  opacity: 0.5;
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

/* ---- ShoppingToggle ---- */
.shopping-toggle {
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  min-height: 32px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s var(--ease-out-quart, ease),
    color 0.15s var(--ease-out-quart, ease),
    border-color 0.15s var(--ease-out-quart, ease);
}

.shopping-toggle:hover {
  border-color: var(--app-success);
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 8%, transparent);
}

.shopping-toggle.is-checked {
  border-color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 15%, transparent);
  color: var(--app-success);
  font-weight: 600;
}

.shopping-toggle:focus-visible {
  outline: 2px solid var(--page-accent, var(--accent-gold, #E9C176));
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .shopping-toggle {
    padding: 10px 16px;
    min-height: 44px;
    font-size: 13px;
  }
}

/* Viewport-based fallback for touch devices that don't report `pointer: coarse`
 * (e.g. iPad with trackpad, Windows tablets). Ensures 44px touch target on
 * narrow viewports regardless of pointer reporting. */
@media (max-width: 640px) {
  .shopping-toggle {
    padding: 10px 16px;
    min-height: 44px;
    font-size: 13px;
  }
}

/* ---- Crystal tags in header ---- */
.crystal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
}

.crystal-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 2px;
  vertical-align: middle;
}

/* ---- Decision boxes ----
 * Per-node decisions are demoted to a flat tinted strip so they don't compete
 * with the actual material card. The root summary keeps the bordered emphasis. */
.decision-box {
  border-radius: 8px;
  padding: 8px 14px;
  margin: 12px 0;
  text-align: center;
  max-width: 360px;
}

.decision-craft {
  background: color-mix(in srgb, var(--el-color-success) 6%, transparent);
  color: var(--el-color-success);
}

.decision-buy {
  background: color-mix(in srgb, var(--el-color-warning) 6%, transparent);
  color: var(--el-color-warning);
}

.summary-box {
  border: 2px solid;
  padding: 12px 20px;
}

.summary-box.decision-craft {
  border-color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  color: inherit;
}

.summary-box.decision-buy {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  color: inherit;
}

.decision-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.decision-main {
  font-size: 13px;
  margin-bottom: 2px;
  word-break: break-word;
  line-height: 1.5;
}

.decision-result {
  font-size: 13px;
  font-weight: 700;
  word-break: break-word;
}

.node-decision {
  max-width: 320px;
  padding: 6px 10px;
}

.node-decision .decision-main {
  font-size: 12px;
}

.node-decision .decision-result {
  font-size: 12px;
}

/* ---- Horizontal tree connectors ---- */
.tree-children {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  padding-top: 28px;
  padding-left: var(--bom-tree-indent);
  padding-right: var(--bom-tree-indent);
}

.tree-children::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 14px;
  background: var(--connector-color);
}

.tree-children::after {
  content: '';
  position: absolute;
  top: 14px;
  left: var(--bom-tree-indent);
  right: var(--bom-tree-indent);
  height: 2px;
  background: var(--connector-color);
}

.tree-children:has(> .tree-branch:only-child)::after {
  display: none;
}

/* Branch flexes its width to match the wider of (card, subtree). This is how
 * deeper subtrees get horizontal space without forcing the card itself to
 * widen. */
.tree-branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 14px;
  flex: 0 0 auto;
}

.tree-branch::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 14px;
  background: var(--connector-color);
}


/* ---- All-done inline message ---- */
.all-done-message {
  margin: 16px auto 4px;
  padding: 10px 16px;
  text-align: center;
  color: var(--app-success);
  font-size: 14px;
  font-weight: 500;
  background: color-mix(in srgb, var(--app-success) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--app-success) 35%, transparent);
  border-radius: 8px;
  max-width: 420px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s var(--ease-out-quart, ease), transform 0.35s var(--ease-out-quart, ease);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
