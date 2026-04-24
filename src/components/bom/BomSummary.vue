<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FlatMaterial, PriceInfo, MaterialNode } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { getPrice } from '@/stores/bom'
import { computeOptimalCosts, type CostDecision } from '@/services/bom-calculator'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import { useMediaQuery } from '@/composables/useMediaQuery'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import ItemName from '@/components/common/ItemName.vue'
import { formatGil } from '@/utils/format'

// Drop low-priority columns on narrow viewports. Element Plus builds a
// fixed-width <colgroup> per table; `display:none` on a <td> leaves the
// matching <col> sized, so the header overflows while the body is clipped.
// Use v-if so el-table never creates those columns in the first place.
const isNarrow = useMediaQuery('(max-width: 720px)')
const isVeryNarrow = useMediaQuery('(max-width: 480px)')
const isMobile = useMediaQuery('(max-width: 640px)')

// Mobile card layout: tap a row to expand cross-world price details in place.
const expandedIds = ref(new Set<number>())
function toggleExpand(row: FlatMaterial) {
  if (expandedIds.value.has(row.itemId)) {
    expandedIds.value.delete(row.itemId)
  } else {
    expandedIds.value.add(row.itemId)
    fetchCrossWorldData(row.itemId, row.name)
  }
  expandedIds.value = new Set(expandedIds.value)
}
function isExpanded(itemId: number): boolean {
  return expandedIds.value.has(itemId)
}

const props = defineProps<{
  materials: FlatMaterial[]
  prices: Map<number, PriceInfo>
  targetItemIds?: number[]
  materialTree?: MaterialNode[]
}>()

const emit = defineEmits<{
  'refresh-prices': []
}>()

const settingsStore = useSettingsStore()

const targetIdSet = computed(() => new Set(props.targetItemIds ?? []))

const rawMaterials = computed(() =>
  props.materials.filter((m) => m.isRaw),
)

const craftableMaterials = computed(() =>
  props.materials.filter((m) => !m.isRaw && !targetIdSet.value.has(m.itemId)),
)

const targetMaterials = computed(() =>
  props.materials.filter((m) => !m.isRaw && targetIdSet.value.has(m.itemId)),
)

function getNqPrice(itemId: number): number {
  return props.prices.get(itemId)?.minPrice ?? 0
}

function getHqPrice(itemId: number): number {
  return props.prices.get(itemId)?.hqMinPrice ?? 0
}

function getUnitPrice(itemId: number): number {
  const priceInfo = props.prices.get(itemId)
  if (!priceInfo) return 0
  return getPrice(priceInfo, settingsStore.priceDisplayMode)
}

function getTotalPrice(itemId: number, amount: number): number {
  return getUnitPrice(itemId) * amount
}

const rawTotalCost = computed(() =>
  rawMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

const craftTotalCost = computed(() =>
  craftableMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

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

const grandTotal = computed(() => {
  if (optimalResult.value) return optimalResult.value.totalCost
  return rawTotalCost.value
})

// Buy-vs-craft comparison for target items
const targetBuyPrice = computed(() =>
  targetMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

const craftSaving = computed(() => targetBuyPrice.value - grandTotal.value)

const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

function handleExpand(row: FlatMaterial, expandedRows: FlatMaterial[]) {
  const expanded = expandedRows.some(r => r.itemId === row.itemId)
  if (!expanded) return
  fetchCrossWorldData(row.itemId, row.name)
}

</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">
          材料總覽與價格
          <el-tag size="small" type="info" style="margin-left: 8px">
            {{ settingsStore.server }}
          </el-tag>
        </span>
        <el-button size="small" @click="emit('refresh-prices')">
          重新取得價格
        </el-button>
      </div>
    </template>

    <el-empty
      v-if="materials.length === 0"
      description="尚未計算"
      :image-size="80"
    />

    <template v-else>
      <!-- Raw materials section -->
      <h4 class="section-title">原始素材（需採集 / 購買）</h4>

      <!-- Mobile: card list with tap-to-expand (el-table's fixed colgroup
           left empty cells on the right when columns were hidden). -->
      <ul v-if="isMobile" class="mat-cards" role="list">
        <li
          v-for="row in rawMaterials"
          :key="row.itemId"
          class="mat-card"
          :class="{ 'is-expanded': isExpanded(row.itemId) }"
        >
          <button
            type="button"
            class="mat-card__row"
            :aria-expanded="isExpanded(row.itemId)"
            @click="toggleExpand(row)"
          >
            <img
              :src="row.icon"
              :alt="row.name"
              crossorigin="anonymous"
              loading="lazy"
              decoding="async"
              class="mat-card__icon"
            />
            <div class="mat-card__body">
              <div class="mat-card__line1">
                <ItemName :item-id="row.itemId" :fallback="row.name" />
                <span class="mat-card__qty">×{{ row.totalAmount }}</span>
              </div>
              <div class="mat-card__line2">
                <span class="mat-card__unit">
                  單價 {{ getUnitPrice(row.itemId) > 0 ? formatGil(getUnitPrice(row.itemId)) : '-' }}
                </span>
                <strong class="mat-card__sub">
                  {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
                </strong>
              </div>
            </div>
            <span class="mat-card__chev" :class="{ 'is-open': isExpanded(row.itemId) }" aria-hidden="true">▾</span>
          </button>
          <div v-if="isExpanded(row.itemId)" class="mat-card__expand">
            <CrossWorldPriceDetail
              :data="crossWorldData.get(row.itemId)"
              :loading="crossWorldLoading.has(row.itemId)"
            />
          </div>
        </li>
      </ul>

      <el-table v-else :data="rawMaterials" border style="width: 100%" size="small" @expand-change="handleExpand">
        <el-table-column type="expand" :width="isNarrow ? 34 : 48">
          <template #default="{ row }">
            <CrossWorldPriceDetail
              :data="crossWorldData.get(row.itemId)"
              :loading="crossWorldLoading.has(row.itemId)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="isNarrow ? '' : '圖示'" :width="isNarrow ? 34 : 50" align="center">
          <template #default="{ row }">
            <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" :style="isNarrow ? 'width: 22px; height: 22px' : 'width: 24px; height: 24px'" />
          </template>
        </el-table-column>
        <el-table-column label="名稱">
          <template #default="{ row }">
            <ItemName :item-id="row.itemId" :fallback="row.name" />
          </template>
        </el-table-column>
        <el-table-column :label="isNarrow ? '數量' : '需求數量'" :width="isNarrow ? 48 : 100" align="center">
          <template #default="{ row }">
            {{ row.totalAmount }}
          </template>
        </el-table-column>
        <el-table-column v-if="!isVeryNarrow" label="NQ 最低" width="110" align="right">
          <template #default="{ row }">
            {{ getNqPrice(row.itemId) > 0 ? formatGil(getNqPrice(row.itemId)) : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="!isNarrow" label="HQ 最低" width="110" align="right">
          <template #default="{ row }">
            <span class="hq-price">{{ getHqPrice(row.itemId) > 0 ? formatGil(getHqPrice(row.itemId)) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="isNarrow ? '價格' : '小計'" :width="isNarrow ? 70 : 120" align="right">
          <template #default="{ row }">
            {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="subtotal">
        原始素材小計：<strong>{{ formatGil(rawTotalCost) }}</strong> Gil
      </div>

      <!-- Craftable intermediates section -->
      <template v-if="craftableMaterials.length > 0">
        <h4 class="section-title">半成品（可製作）</h4>

        <ul v-if="isMobile" class="mat-cards" role="list">
          <li
            v-for="row in craftableMaterials"
            :key="row.itemId"
            class="mat-card"
            :class="{ 'is-expanded': isExpanded(row.itemId) }"
          >
            <button
              type="button"
              class="mat-card__row"
              :aria-expanded="isExpanded(row.itemId)"
              @click="toggleExpand(row)"
            >
              <img
                :src="row.icon"
                :alt="row.name"
                crossorigin="anonymous"
                loading="lazy"
                decoding="async"
                class="mat-card__icon"
              />
              <div class="mat-card__body">
                <div class="mat-card__line1">
                  <ItemName :item-id="row.itemId" :fallback="row.name" />
                  <span class="mat-card__qty">×{{ row.totalAmount }}</span>
                  <el-tag
                    v-if="decisionsMap.get(row.itemId)"
                    :type="decisionsMap.get(row.itemId)!.recommendation === 'craft' ? 'success' : 'warning'"
                    size="small"
                    class="mat-card__tag"
                  >
                    {{ decisionsMap.get(row.itemId)!.recommendation === 'craft' ? '自製較省' : '直購較省' }}
                  </el-tag>
                </div>
                <div class="mat-card__line2">
                  <span class="mat-card__unit">
                    直購 {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
                  </span>
                  <span v-if="decisionsMap.get(row.itemId)" class="mat-card__unit">
                    · 自製 {{ formatGil(decisionsMap.get(row.itemId)!.craftCost) }}
                  </span>
                </div>
              </div>
              <span class="mat-card__chev" :class="{ 'is-open': isExpanded(row.itemId) }" aria-hidden="true">▾</span>
            </button>
            <div v-if="isExpanded(row.itemId)" class="mat-card__expand">
              <CrossWorldPriceDetail
                :data="crossWorldData.get(row.itemId)"
                :loading="crossWorldLoading.has(row.itemId)"
              />
            </div>
          </li>
        </ul>

        <el-table v-else :data="craftableMaterials" border style="width: 100%" size="small" @expand-change="handleExpand">
          <el-table-column type="expand" :width="isNarrow ? 34 : 48">
            <template #default="{ row }">
              <CrossWorldPriceDetail
                :data="crossWorldData.get(row.itemId)"
                :loading="crossWorldLoading.has(row.itemId)"
              />
            </template>
          </el-table-column>
          <el-table-column :label="isNarrow ? '' : '圖示'" :width="isNarrow ? 34 : 50" align="center">
            <template #default="{ row }">
              <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" :style="isNarrow ? 'width: 22px; height: 22px' : 'width: 24px; height: 24px'" />
            </template>
          </el-table-column>
          <el-table-column label="名稱">
            <template #default="{ row }">
              <ItemName :item-id="row.itemId" :fallback="row.name" />
            </template>
          </el-table-column>
          <el-table-column :label="isNarrow ? '數量' : '需求數量'" :width="isNarrow ? 48 : 100" align="center">
            <template #default="{ row }">
              {{ row.totalAmount }}
            </template>
          </el-table-column>
          <el-table-column v-if="!isVeryNarrow" label="NQ 最低" width="110" align="right">
            <template #default="{ row }">
              {{ getNqPrice(row.itemId) > 0 ? formatGil(getNqPrice(row.itemId)) : '-' }}
            </template>
          </el-table-column>
          <el-table-column v-if="!isNarrow" label="HQ 最低" width="110" align="right">
            <template #default="{ row }">
              <span class="hq-price">{{ getHqPrice(row.itemId) > 0 ? formatGil(getHqPrice(row.itemId)) : '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!isNarrow" label="直購成本" width="120" align="right">
            <template #default="{ row }">
              {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
            </template>
          </el-table-column>
          <el-table-column :label="isNarrow ? '材料' : '材料成本'" :width="isNarrow ? 70 : 120" align="right">
            <template #default="{ row }">
              <template v-if="decisionsMap.get(row.itemId)">
                {{ formatGil(decisionsMap.get(row.itemId)!.craftCost) }}
              </template>
              <template v-else>-</template>
            </template>
          </el-table-column>
          <el-table-column v-if="!isVeryNarrow" label="建議" :width="isNarrow ? 70 : 120" align="center">
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
        </el-table>

        <div class="subtotal">
          半成品小計：<strong>{{ formatGil(craftTotalCost) }}</strong> Gil
        </div>
      </template>

      <!-- Grand total -->
      <el-divider />
      <div class="grand-total">
        最優製作成本：<strong>{{ formatGil(grandTotal) }}</strong> Gil
      </div>

      <!-- Buy vs Craft comparison -->
      <template v-if="targetMaterials.length > 0 && targetBuyPrice > 0">
        <div class="buy-compare">
          <div class="buy-compare-row">
            <span>直接購買：</span>
            <span>
              <template v-for="(m, i) in targetMaterials" :key="m.itemId">
                <template v-if="i > 0">、</template>
                <ItemName :item-id="m.itemId" :fallback="m.name" />
                <template v-if="m.totalAmount > 1"> ×{{ m.totalAmount }}</template>
              </template>
              = <strong>{{ formatGil(targetBuyPrice) }}</strong> Gil
            </span>
          </div>
          <div class="buy-compare-verdict">
            <el-tag v-if="craftSaving > 0" type="success" size="small">
              自製省 {{ formatGil(craftSaving) }} Gil
            </el-tag>
            <el-tag v-else-if="craftSaving < 0" type="warning" size="small">
              直接購買省 {{ formatGil(-craftSaving) }} Gil
            </el-tag>
            <el-tag v-else type="info" size="small">
              費用相同
            </el-tag>
          </div>
        </div>
      </template>
    </template>
  </el-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}


.subtotal {
  margin-top: 8px;
  text-align: right;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.grand-total {
  text-align: right;
  font-size: 18px;
  color: var(--el-color-primary);
}

.hq-price {
  color: var(--accent-gold);
}

.buy-compare {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.buy-compare-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.buy-compare-row > * {
  min-width: 0;
  word-break: break-word;
}

.buy-compare-verdict {
  margin-top: 8px;
  text-align: right;
}

/* Mobile: tighten cell padding and font only — columns are gated via v-if in
 * the template (not CSS). Hiding columns via `display:none` on <td> left the
 * <colgroup>'s fixed-width <col> sized, which made the header overflow the
 * body and pushed most columns off-screen. */
@media (max-width: 720px) {
  :deep(.el-table .cell) {
    padding-left: 6px;
    padding-right: 6px;
  }

  :deep(.el-table__body) {
    font-size: 12.5px;
  }

  :deep(.el-table__header th) {
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  :deep(.el-table__body) {
    font-size: 12px;
  }
}

/* Mobile: strip the wrapping el-card chrome so the card list reads
 * as part of the parent flat section instead of a card-in-card. */
@media (max-width: 640px) {
  :deep(.el-card) {
    background: transparent;
    border: 0;
    box-shadow: none;
  }
  :deep(.el-card__header) {
    padding: 0 0 10px;
    border-bottom: 0;
  }
  :deep(.el-card__body) {
    padding: 0;
  }
}

/* --- Mobile card layout (replaces el-table under 640px) --- */
.mat-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--app-border, var(--el-border-color-lighter));
}

.mat-card {
  border-bottom: 1px solid var(--app-border, var(--el-border-color-lighter));
}

.mat-card__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 4px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mat-card__row:hover {
  background: color-mix(in srgb, var(--app-accent, var(--el-color-primary)) 5%, transparent);
}

.mat-card__icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.mat-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mat-card__line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text, var(--el-text-color-primary));
}

.mat-card__line1 > :first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.mat-card__qty {
  font-size: 12px;
  color: var(--app-text-muted, var(--el-text-color-secondary));
  flex-shrink: 0;
}

.mat-card__tag {
  flex-shrink: 0;
}

.mat-card__line2 {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted, var(--el-text-color-secondary));
}

.mat-card__unit {
  min-width: 0;
}

.mat-card__sub {
  margin-left: auto;
  color: var(--accent-gold, var(--el-color-warning));
  font-weight: 700;
  font-size: 13px;
}

.mat-card__chev {
  flex-shrink: 0;
  color: var(--app-text-muted, var(--el-text-color-secondary));
  font-size: 12px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
}

.mat-card__chev.is-open {
  transform: rotate(180deg);
  color: var(--app-accent, var(--el-color-primary));
}

.mat-card__expand {
  padding: 0 4px 12px;
}
</style>
