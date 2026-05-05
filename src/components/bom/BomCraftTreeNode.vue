<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { MaterialNode } from '@/stores/bom'
import { useBomStore, getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import { computeOptimalCosts } from '@/services/bom-calculator'
import { formatGil } from '@/utils/format'
import BomDecisionRow from '@/components/bom/BomDecisionRow.vue'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'

const props = defineProps<{
  /** The parent material node whose children we render. */
  parent: MaterialNode
  /** Indent level — visual offset within the drill-down. */
  depth?: number
}>()

const bom = useBomStore()
const settings = useSettingsStore()

const CRYSTAL_THRESHOLD = 20

function isCrystal(node: MaterialNode): boolean {
  return node.itemId < CRYSTAL_THRESHOLD
}

const visibleChildren = computed(() =>
  (props.parent.children ?? []).filter((c) => !isCrystal(c)),
)

const crystalChildren = computed(() =>
  (props.parent.children ?? []).filter(isCrystal),
)

function getUnitPriceOrNull(itemId: number): number | null {
  const info = bom.prices.get(itemId)
  if (!info) return null
  const v = getPrice(info, settings.priceDisplayMode)
  return v > 0 ? v : null
}

const subtreeOptimal = computed(() =>
  computeOptimalCosts([props.parent], getUnitPriceOrNull),
)

const directBuyCost = computed(() => {
  const unit = getUnitPriceOrNull(props.parent.itemId)
  if (unit === null) return null
  return unit * props.parent.amount
})

const optimalCraftCost = computed(() => subtreeOptimal.value.totalCost)

const verdict = computed(() => {
  if (directBuyCost.value === null) return null
  const craft = optimalCraftCost.value
  const buy = directBuyCost.value
  if (craft <= 0 || buy <= 0) return null
  const diff = Math.abs(buy - craft)
  return craft < buy
    ? { kind: 'craft' as const, saving: diff }
    : { kind: 'buy' as const, saving: diff }
})

function isChildCraftable(node: MaterialNode): boolean {
  return !!(node.recipeId && node.children && node.children.length > 0)
}

const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

const canMarketParent = computed(() => {
  const a = bom.acquisitionAvailability.get(props.parent.itemId)
  return a ? a.canMarket : true
})

const crossWorldRows = computed(() => crossWorldData.value.get(props.parent.itemId))
const crossWorldIsLoading = computed(() => crossWorldLoading.value.has(props.parent.itemId))

onMounted(() => {
  if (canMarketParent.value) {
    void fetchCrossWorldData(props.parent.itemId, props.parent.name)
  }
})
</script>

<template>
  <div class="craft-tree-node" :data-depth="depth ?? 1">
    <div v-if="verdict || directBuyCost !== null" class="ctn-compare">
      <div class="ctn-compare__row">
        <span class="ctn-compare__label">直購本品</span>
        <span class="ctn-compare__val">
          {{ directBuyCost !== null ? formatGil(directBuyCost) : '—' }}
        </span>
      </div>
      <div class="ctn-compare__row">
        <span class="ctn-compare__label">材料自製</span>
        <span class="ctn-compare__val ctn-compare__val--craft">
          {{ formatGil(optimalCraftCost) }}
        </span>
      </div>
      <div v-if="verdict" class="ctn-compare__verdict" :data-kind="verdict.kind">
        {{ verdict.kind === 'craft' ? '自製省' : '直購省' }} {{ formatGil(verdict.saving) }}
      </div>
    </div>

    <div v-if="canMarketParent" class="ctn-cross-world">
      <span class="ctn-cross-world__label">跨服比價</span>
      <CrossWorldPriceDetail
        :data="crossWorldRows"
        :loading="crossWorldIsLoading"
        compact
      />
    </div>

    <div v-if="crystalChildren.length > 0" class="ctn-crystals">
      <span class="ctn-crystals__label">水晶：</span>
      <span
        v-for="c in crystalChildren"
        :key="c.itemId"
        class="ctn-crystal"
      >{{ c.name }} ×{{ c.amount }}</span>
    </div>

    <div class="ctn-children">
      <template v-for="child in visibleChildren" :key="child.itemId">
        <BomDecisionRow
          :item-id="child.itemId"
          :name="child.name"
          :icon="child.icon"
          :amount="child.amount"
          :is-craftable="isChildCraftable(child)"
          nested
        />
        <div
          v-if="isChildCraftable(child) && bom.isRowExpanded(child.itemId) && bom.getEffectiveMode(child.itemId) === 'craft'"
          class="ctn-nested-wrap"
        >
          <BomCraftTreeNode :parent="child" :depth="(depth ?? 1) + 1" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.craft-tree-node {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 14px;
  border-top: 1px dashed var(--app-border);
}

.ctn-compare {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  margin: 0 14px;
  background: color-mix(in srgb, var(--app-craft-dim) 22%, var(--app-surface));
  border-radius: 10px;
  font-size: 13px;
}

.ctn-compare__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ctn-compare__label {
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-family: 'Fira Code', ui-monospace, monospace;
}

.ctn-compare__val {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.ctn-compare__val--craft {
  color: var(--app-craft);
}

.ctn-compare__verdict {
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.ctn-compare__verdict[data-kind='craft'] {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  color: var(--app-craft);
}

.ctn-compare__verdict[data-kind='buy'] {
  background: var(--app-surface-hover);
  color: var(--app-text-muted);
}

.ctn-cross-world {
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ctn-cross-world__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 11px;
  color: var(--app-text-muted);
}

.ctn-crystals {
  padding: 4px 14px;
  font-size: 12px;
  color: var(--app-text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.ctn-crystals__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 11px;
}

.ctn-crystal {
  font-size: 12.5px;
  color: var(--app-text);
}

.ctn-children {
  display: flex;
  flex-direction: column;
}

.ctn-nested-wrap {
  margin-left: 18px;
  border-left: 1px solid var(--app-border);
  padding-left: 0;
}
</style>
