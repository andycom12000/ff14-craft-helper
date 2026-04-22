<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialNode, PriceInfo } from '@/stores/bom'
import { getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { computeOptimalCosts } from '@/services/bom-calculator'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{
  tree: MaterialNode[]
  prices: Map<number, PriceInfo>
}>()

const emit = defineEmits<{
  'simulate-recipe': [recipeId: number]
  'toggle-collapsed': [node: MaterialNode]
}>()

const settings = useSettingsStore()

const CRYSTAL_THRESHOLD = 20

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
        // collapsed node: only count its own crystals (not sub-tree)
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

const crystalColorsByElement = [
  '#F87171', // fire
  '#A78BFA', // ice
  '#34D399', // wind
  '#F472B6', // earth
  '#FBBF24', // lightning
  '#60A5FA', // water
]

function getCrystalColor(itemId: number): string {
  return crystalColorsByElement[(itemId - 2) % 6]
}

function getUnitPrice(itemId: number): number {
  const info = props.prices.get(itemId)
  if (!info) return 0
  return getPrice(info, settings.priceDisplayMode)
}

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

function getNodeDisplayInfo(node: MaterialNode): NodeDisplayInfo | null {
  if (!node.children || node.children.length === 0 || !node.recipeId || node.collapsed) return null
  const decision = decisionsMap.value.get(node.itemId)
  if (decision) {
    return {
      buyCost: decision.buyCost,
      craftCost: decision.craftCost,
      recommendation: decision.recommendation,
      saving: Math.abs(decision.buyCost - decision.craftCost),
    }
  }
  // Fallback: compute inline
  const unitPrice = getUnitPrice(node.itemId)
  const buyCost = unitPrice * node.amount
  const craftCost = node.children.reduce(
    (sum, child) => sum + getUnitPrice(child.itemId) * child.amount,
    0,
  )
  const recommendation = buyCost > 0 && buyCost <= craftCost ? 'buy' : 'craft'
  return {
    buyCost,
    craftCost,
    recommendation,
    saving: Math.abs(buyCost - craftCost),
  }
}

// Summary: root-level comparison
const rootSummary = computed(() => {
  if (props.tree.length === 0) return null
  const root = props.tree[0]
  if (!root.children || root.children.length === 0) return null

  const optimalCraft = optimalResult.value.totalCost
  const unitPrice = getUnitPrice(root.itemId)
  const buyDirect = unitPrice * root.amount

  const recommendation = buyDirect > 0 && buyDirect <= optimalCraft ? 'buy' : 'craft'
  const saving = Math.abs(buyDirect - optimalCraft)

  return { optimalCraft, buyDirect, recommendation, saving }
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
      <!-- Iterate root nodes (usually 1) -->
      <div v-for="root in tree" :key="root.itemId" class="tree-root">
        <!-- Root node card -->
        <div class="tree-node-card root-node">
          <div class="node-content">
            <div class="node-icon-wrapper">
              <img :src="root.icon" :alt="root.name" crossorigin="anonymous" class="node-icon" />
              <span v-if="root.amount > 1" class="qty-badge">{{ root.amount }}</span>
            </div>
            <div class="node-info">
              <span class="node-name">
                <ItemName :item-id="root.itemId" :fallback="root.name" />
              </span>
              <span class="node-price">
                {{ formatGil(getUnitPrice(root.itemId)) }} × {{ root.amount }}
                = {{ formatGil(getUnitPrice(root.itemId) * root.amount) }} Gil
              </span>
            </div>
          </div>
          <div v-if="root.recipeId" class="node-actions">
            <el-button type="primary" size="small" text @click="emit('simulate-recipe', root.recipeId!)">
              加入模擬佇列
            </el-button>
          </div>
        </div>

        <!-- Summary decision box -->
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
          class="tree-children"
        >
          <div
            v-for="child in getNonCrystalChildren(root)"
            :key="child.itemId"
            class="tree-branch"
          >
            <!-- Intermediate decision box -->
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

            <!-- Child node card -->
            <div
              class="tree-node-card"
              :class="[child.recipeId ? 'intermediate-node' : 'raw-node', { 'node-collapsed-card': child.collapsed }]"
            >
              <div class="node-content">
                <div class="node-icon-wrapper">
                  <img :src="child.icon" :alt="child.name" crossorigin="anonymous" class="node-icon" />
                  <span v-if="child.amount > 1" class="qty-badge">{{ child.amount }}</span>
                </div>
                <div class="node-info">
                  <span class="node-name" :class="{ 'name-collapsed': child.collapsed }">
                    <ItemName :item-id="child.itemId" :fallback="child.name" />
                  </span>
                  <span class="node-price">
                    {{ formatGil(getUnitPrice(child.itemId)) }} × {{ child.amount }}
                    = {{ formatGil(getUnitPrice(child.itemId) * child.amount) }} Gil
                  </span>
                </div>
              </div>
              <div v-if="child.recipeId" class="node-actions">
                <el-button
                  :type="child.collapsed ? 'success' : 'warning'"
                  size="small" text
                  @click="emit('toggle-collapsed', child)"
                >
                  {{ child.collapsed ? '改為製作' : '改為購買' }}
                </el-button>
                <el-button type="primary" size="small" text @click="emit('simulate-recipe', child.recipeId!)">
                  加入模擬佇列
                </el-button>
              </div>
            </div>

            <!-- Level 2 children (non-crystal only) -->
            <div
              v-if="getNonCrystalChildren(child).length > 0 && !child.collapsed"
              class="tree-children"
            >
              <div
                v-for="grandchild in getNonCrystalChildren(child)"
                :key="grandchild.itemId"
                class="tree-branch"
              >
                <!-- Grandchild decision box -->
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

                <!-- Grandchild node card -->
                <div
                  class="tree-node-card"
                  :class="[grandchild.recipeId ? 'intermediate-node' : 'raw-node', { 'node-collapsed-card': grandchild.collapsed }]"
                >
                  <div class="node-content">
                    <div class="node-icon-wrapper">
                      <img :src="grandchild.icon" :alt="grandchild.name" crossorigin="anonymous" class="node-icon" />
                      <span v-if="grandchild.amount > 1" class="qty-badge">{{ grandchild.amount }}</span>
                    </div>
                    <div class="node-info">
                      <span class="node-name" :class="{ 'name-collapsed': grandchild.collapsed }">
                        <ItemName :item-id="grandchild.itemId" :fallback="grandchild.name" />
                      </span>
                      <span class="node-price">
                        {{ formatGil(getUnitPrice(grandchild.itemId)) }} × {{ grandchild.amount }}
                        = {{ formatGil(getUnitPrice(grandchild.itemId) * grandchild.amount) }} Gil
                      </span>
                    </div>
                  </div>
                  <div v-if="grandchild.recipeId" class="node-actions">
                    <el-button
                      :type="grandchild.collapsed ? 'success' : 'warning'"
                      size="small" text
                      @click="emit('toggle-collapsed', grandchild)"
                    >
                      {{ grandchild.collapsed ? '改為製作' : '改為購買' }}
                    </el-button>
                    <el-button type="primary" size="small" text @click="emit('simulate-recipe', grandchild.recipeId!)">
                      加入模擬佇列
                    </el-button>
                  </div>
                </div>

                <!-- Level 3 children (non-crystal only) -->
                <div
                  v-if="getNonCrystalChildren(grandchild).length > 0 && !grandchild.collapsed"
                  class="tree-children"
                >
                  <div
                    v-for="leaf in getNonCrystalChildren(grandchild)"
                    :key="leaf.itemId"
                    class="tree-branch"
                  >
                    <div class="tree-node-card raw-node">
                      <div class="node-content">
                        <div class="node-icon-wrapper">
                          <img :src="leaf.icon" :alt="leaf.name" crossorigin="anonymous" class="node-icon" />
                          <span v-if="leaf.amount > 1" class="qty-badge">{{ leaf.amount }}</span>
                        </div>
                        <div class="node-info">
                          <span class="node-name">
                            <ItemName :item-id="leaf.itemId" :fallback="leaf.name" />
                          </span>
                          <span class="node-price">
                            {{ formatGil(getUnitPrice(leaf.itemId)) }} × {{ leaf.amount }}
                            = {{ formatGil(getUnitPrice(leaf.itemId) * leaf.amount) }} Gil
                          </span>
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
    </template>
  </el-card>
</template>

<style scoped>
.craft-tree-card {
  --connector-color: var(--el-color-success-light-5);
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
  overflow-x: auto;
  padding: 16px 0;
}

.tree-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: fit-content;
}

/* ---- Node cards ---- */
.tree-node-card {
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 14px;
  background: var(--el-bg-color);
  min-width: 160px;
  max-width: 280px;
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

.node-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon-wrapper {
  position: relative;
  flex-shrink: 0;
}

.node-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
}

.qty-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--el-color-success);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.node-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.node-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
}

.node-price {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
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

/* ---- Decision boxes ---- */
.decision-box {
  border: 2px solid;
  border-radius: 8px;
  padding: 8px 14px;
  margin: 12px 0;
  text-align: center;
  max-width: 360px;
}

.decision-craft {
  border-color: var(--el-color-success);
  background: rgba(103, 194, 58, 0.08);
}

.decision-buy {
  border-color: var(--el-color-warning);
  background: rgba(230, 162, 60, 0.08);
}

.summary-box {
  padding: 12px 20px;
}

.decision-subtitle {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.decision-main {
  font-size: 13px;
  margin-bottom: 2px;
}

.decision-result {
  font-size: 13px;
  font-weight: 700;
}

.node-decision {
  max-width: 280px;
  padding: 6px 10px;
}

.node-decision .decision-main {
  font-size: 12px;
}

.node-decision .decision-result {
  font-size: 12px;
}

/* ---- Tree connectors ---- */
.tree-children {
  display: flex;
  justify-content: center;
  gap: 16px;
  position: relative;
  padding-top: 28px;
}

/* Vertical line from parent down to the horizontal rail */
.tree-children::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 14px;
  background: var(--connector-color);
}

/* Horizontal rail spanning all children */
.tree-children::after {
  content: '';
  position: absolute;
  top: 14px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--connector-color);
}

/* Hide horizontal rail when only one child */
.tree-children:has(> .tree-branch:only-child)::after {
  display: none;
}

.tree-branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 14px;
}

/* Vertical line from rail down to each child */
.tree-branch::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 14px;
  background: var(--connector-color);
}
</style>
