<script setup lang="ts">
import { ref, watch, triggerRef, computed, nextTick, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import type { CrystalSummary, ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import type { BuyFinishedDecision, SelfCraftCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import { useIsMobile } from '@/composables/useMediaQuery'
import CrossWorldPriceDetail, { type WorldPriceRow } from '@/components/common/CrossWorldPriceDetail.vue'
import ItemName from '@/components/common/ItemName.vue'
import SelfCraftSuggestions from './SelfCraftSuggestions.vue'
import { formatGil } from '@/utils/format'

const isMobile = useIsMobile()
const mobileExpanded = reactive(new Set<string>())

const props = defineProps<{
  crystals: CrystalSummary[]
  serverGroups: ServerGroup[]
  selfCraftCandidates: SelfCraftCandidate[]
  buyFinishedItems: BuyFinishedDecision[]
  grandTotal: number
  crossWorldCache?: Map<number, WorldPriceSummary[]>
}>()

const batchStore = useBatchStore()
const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

const effectiveServerGroups = computed<ServerGroup[]>(() => {
  const items = batchStore.finalShoppingItems
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

const buyFinishedSavings = computed(() => {
  if (!props.buyFinishedItems.length) return null
  const craftable = props.buyFinishedItems.filter(bf => Number.isFinite(bf.craftCost))
  if (!craftable.length) return null
  const totalSaved = craftable.reduce(
    (sum, bf) => sum + (bf.craftCost - bf.buyPrice) * bf.quantity, 0)
  return { count: craftable.length, totalSaved }
})

// Seed composable cache with pre-fetched data from batch optimizer
watch(() => props.crossWorldCache, (cache) => {
  if (!cache) return
  let seeded = false
  for (const [id, summary] of cache) {
    if (!crossWorldData.value.has(id)) {
      crossWorldData.value.set(id, summary)
      seeded = true
    }
  }
  if (seeded) triggerRef(crossWorldData)
}, { immediate: true })

// Crystal itemIds 2-19, repeating every 6: fire, ice, wind, earth, lightning, water
const crystalColorTokens = [
  'var(--element-fire)',
  'var(--element-ice)',
  'var(--element-wind)',
  'var(--element-earth)',
  'var(--element-lightning)',
  'var(--element-water)',
]

function getCrystalColor(itemId: number): string {
  if (itemId < 2 || itemId > 19) return 'var(--element-default)'
  return crystalColorTokens[(itemId - 2) % 6]
}

function handleExpand(row: MaterialWithPrice, expandedRows: MaterialWithPrice[]) {
  const expanded = expandedRows.some(r => r.itemId === row.itemId && r.type === row.type)
  if (!expanded) return
  fetchCrossWorldData(row.itemId, row.name)
}

/**
 * Tag the server recommended by the optimizer (row.server) as `isRecommended`.
 * This surfaces in CrossWorldPriceDetail as the green-highlighted row.
 */
function effectiveQuality(row: MaterialWithPrice): 'nq' | 'hq' {
  return batchStore.qualityOverrides[row.itemId] ?? batchStore.bulkQualityMode
}

function recommendedRowsFor(row: MaterialWithPrice): WorldPriceRow[] | undefined {
  const worlds = crossWorldData.value.get(row.itemId)
  if (!worlds) return undefined
  if (!row.server) return worlds
  return worlds.map(w => ({ ...w, isRecommended: w.worldName === row.server }))
}

const flashRowKey = ref<string | null>(null)

function doCopy(row: MaterialWithPrice) {
  navigator.clipboard.writeText(row.name)
  ElMessage({ message: `已複製「${row.name}」`, type: 'success', duration: 1500 })
  const key = `${row.itemId}-${row.type}`
  flashRowKey.value = key
  nextTick(() => {
    setTimeout(() => { flashRowKey.value = null }, 300)
  })
}

function copyName(row: MaterialWithPrice, _col: unknown, event: Event) {
  // Don't copy when clicking the expand arrow or the explicit copy button
  const target = event.target as HTMLElement
  if (target.closest('.el-table__expand-icon')) return
  if (target.closest('.copy-btn')) return
  if (target.closest('.el-checkbox')) return
  doCopy(row)
}

function rowClassName({ row }: { row: MaterialWithPrice }) {
  const classes: string[] = []
  if (flashRowKey.value === `${row.itemId}-${row.type}`) classes.push('row-flash')
  if (batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)) classes.push('row-checked')
  return classes.join(' ')
}

function rowAriaLabel(row: MaterialWithPrice): string {
  return `${row.name} — 點一下整列複製品名`
}

// Keying by itemId alone in quick-buy — type mutates on toggle and we need
// el-table to keep its expand state. Macro can have same itemId at NQ and HQ.
function getRowKey(row: MaterialWithPrice): string {
  if (batchStore.calcMode === 'quick-buy') return String(row.itemId)
  const fp = row.isFinishedProduct ? '|fp' : ''
  return `${row.itemId}|${row.type}${fp}`
}

function toggleMobileExpand(row: MaterialWithPrice) {
  const key = getRowKey(row)
  if (mobileExpanded.has(key)) {
    mobileExpanded.delete(key)
  } else {
    mobileExpanded.add(key)
    fetchCrossWorldData(row.itemId, row.name)
  }
}

function isMobileExpanded(row: MaterialWithPrice): boolean {
  return mobileExpanded.has(getRowKey(row))
}

function isRowChecked(row: MaterialWithPrice): boolean {
  return batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)
}
</script>

<template>
  <div class="shopping-list">
    <SelfCraftSuggestions :candidates="selfCraftCandidates" />

    <!-- Crystals -->
    <div v-if="crystals.length > 0" class="crystal-section">
      <el-text size="small" type="info" tag="div" class="section-label">水晶（不計入費用）</el-text>
      <div class="crystal-tags">
        <el-tag v-for="c in crystals" :key="c.itemId" type="info" effect="plain" round size="small">
          <span class="crystal-dot" :style="{ background: getCrystalColor(c.itemId) }" />
          <ItemName :item-id="c.itemId" :fallback="c.name" /> x{{ c.amount }}
        </el-tag>
      </div>
      <el-divider />
    </div>

    <!-- Buy-finished summary -->
    <div v-if="buyFinishedSavings" class="buy-finished-summary">
      <template v-if="isMobile">
        <div class="buy-finished-note">
          <span class="buy-finished-dot" aria-hidden="true" />
          <span>{{ buyFinishedSavings.count }} 件改直購，省 <strong>{{ formatGil(buyFinishedSavings.totalSaved) }}</strong> Gil</span>
        </div>
      </template>
      <el-alert v-else type="success" :closable="false" show-icon>
        <template #title>
          {{ buyFinishedSavings.count }} 件配方改為直購成品，共省 {{ formatGil(buyFinishedSavings.totalSaved) }} Gil
        </template>
      </el-alert>
    </div>

    <!-- Global NQ/HQ toggle (quick-buy mode only). Lives here, next to the
         results, so the user can swap quality without re-running. -->
    <div v-if="batchStore.calcMode === 'quick-buy'" class="global-quality-row">
      <span class="section-label">全域品質：</span>
      <div class="quality-chip" role="tablist" aria-label="全域品質切換">
        <button
          type="button"
          class="quality-pill"
          :class="{ 'quality-pill--active': batchStore.bulkQualityMode === 'nq' }"
          :aria-selected="batchStore.bulkQualityMode === 'nq'"
          @click="batchStore.setBulkQuality('nq')"
        >全 NQ</button>
        <button
          type="button"
          class="quality-pill quality-pill--hq"
          :class="{ 'quality-pill--active': batchStore.bulkQualityMode === 'hq' }"
          :aria-selected="batchStore.bulkQualityMode === 'hq'"
          @click="batchStore.setBulkQuality('hq')"
        >全 HQ</button>
      </div>
      <el-text size="small" type="info">展開素材可單獨調整</el-text>
    </div>

    <!-- Server groups -->
    <div class="server-grid">
    <div v-for="group in effectiveServerGroups" :key="group.server" class="server-group">
      <div class="server-header">
        <div class="server-info">
          <el-tag v-if="!isMobile" type="primary" size="small">{{ group.server }}</el-tag>
          <span v-else class="server-name">{{ group.server }}</span>
          <el-text size="small" type="info">{{ group.items.length }} 項</el-text>
        </div>
        <span class="server-subtotal">{{ formatGil(group.subtotal) }} Gil</span>
      </div>
      <el-table v-if="!isMobile" :data="group.items" size="small" class="material-table clickable-rows" :row-key="getRowKey" :row-class-name="rowClassName" @expand-change="handleExpand" @row-click="copyName">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expanded-controls">
              <!-- Quality toggle: quick-buy only -->
              <div v-if="batchStore.calcMode === 'quick-buy' && !row.isFinishedProduct" class="quality-toggle" role="tablist" aria-label="切換品質">
                <button
                  type="button"
                  class="quality-toggle-pill"
                  :class="{ 'quality-toggle-pill--active': effectiveQuality(row) === 'nq' }"
                  @click.stop="batchStore.setQualityOverride(row.itemId, 'nq')"
                >NQ</button>
                <button
                  type="button"
                  class="quality-toggle-pill quality-toggle-pill--hq"
                  :class="{ 'quality-toggle-pill--active': effectiveQuality(row) === 'hq' }"
                  @click.stop="batchStore.setQualityOverride(row.itemId, 'hq')"
                >HQ</button>
              </div>

              <!-- Self-make toggle: only when optimizer downgraded this finished product to buy -->
              <div v-if="row.isFinishedProduct" class="self-make-toggle" @click.stop>
                <el-switch
                  :model-value="!!batchStore.selfMakeOverrides[row.itemId]"
                  size="small"
                  inline-prompt
                  @change="batchStore.toggleSelfMake(row.itemId)"
                />
                <span class="settings-text">改為自製</span>
              </div>
            </div>
            <CrossWorldPriceDetail
              :data="recommendedRowsFor(row)"
              :loading="crossWorldLoading.has(row.itemId)"
              show-listing-count
            />
          </template>
        </el-table-column>
        <el-table-column label="" width="44" align="center">
          <template #default="{ row }">
            <div @click.stop>
              <el-checkbox
                :model-value="batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)"
                :aria-label="`標記已採購：${row.name}`"
                @change="() => batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="" width="36">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="material-icon" />
          </template>
        </el-table-column>
        <el-table-column label="素材" min-width="120">
          <template #default="{ row }">
            <span class="material-name-wrap" :title="rowAriaLabel(row)">
              <span class="material-name">
                <ItemName :item-id="row.itemId" :fallback="row.name" />
              </span>
              <button
                type="button"
                class="copy-btn"
                :aria-label="`複製品名：${row.name}`"
                @click.stop="doCopy(row)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </span>
            <template v-if="row.isFinishedProduct">
              <el-tag size="small" type="success" class="finished-badge">直購成品</el-tag>
              <div v-if="row.craftCostComparison" class="craft-compare-hint">
                <template v-if="Number.isFinite(row.craftCostComparison.craftCost)">
                  自製需 {{ formatGil(row.craftCostComparison.craftCost) }} Gil，省 {{ formatGil(row.craftCostComparison.craftCost - row.craftCostComparison.buyPrice) }} Gil
                </template>
                <template v-else>
                  無法自製
                </template>
              </div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="類型" width="55">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'hq' ? 'warning' : 'info'">
              {{ row.type.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="數量" prop="amount" width="50" />
        <el-table-column label="單價" width="70" align="right">
          <template #default="{ row }">{{ formatGil(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column label="小計" width="80" align="right">
          <template #default="{ row }">
            <el-text type="warning">{{ formatGil(row.unitPrice * row.amount) }}</el-text>
          </template>
        </el-table-column>
      </el-table>

      <!-- Mobile card layout: single-column stack, tap body to expand -->
      <ul v-else class="material-cards">
        <li
          v-for="row in group.items"
          :key="getRowKey(row)"
          class="material-card"
          :class="{ 'material-card--checked': isRowChecked(row), 'material-card--expanded': isMobileExpanded(row) }"
        >
          <div class="material-card__row" @click="toggleMobileExpand(row)">
            <label class="material-card__check" @click.stop>
              <el-checkbox
                :model-value="isRowChecked(row)"
                :aria-label="`標記已採購：${row.name}`"
                @change="() => batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)"
              />
            </label>
            <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="material-card__icon" />
            <div class="material-card__body">
              <div class="material-card__line1">
                <span class="material-card__name">
                  <ItemName :item-id="row.itemId" :fallback="row.name" />
                </span>
                <el-tag size="small" :type="row.type === 'hq' ? 'warning' : 'info'" class="material-card__type">
                  {{ row.type.toUpperCase() }}
                </el-tag>
                <el-tag v-if="row.isFinishedProduct" size="small" type="success">直購</el-tag>
              </div>
              <div class="material-card__line2">
                <span class="material-card__qty">× {{ row.amount }}</span>
                <span class="material-card__price">{{ formatGil(row.unitPrice) }}</span>
                <strong class="material-card__subtotal">{{ formatGil(row.unitPrice * row.amount) }}</strong>
              </div>
              <div v-if="row.isFinishedProduct && row.craftCostComparison" class="material-card__hint">
                <template v-if="Number.isFinite(row.craftCostComparison.craftCost)">
                  自製需 {{ formatGil(row.craftCostComparison.craftCost) }}，省 {{ formatGil(row.craftCostComparison.craftCost - row.craftCostComparison.buyPrice) }}
                </template>
                <template v-else>無法自製</template>
              </div>
            </div>
            <span class="material-card__chev" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
          <div v-if="isMobileExpanded(row)" class="material-card__detail" @click.stop>
            <div class="expanded-controls">
              <div v-if="batchStore.calcMode === 'quick-buy' && !row.isFinishedProduct" class="quality-toggle" role="tablist" aria-label="切換品質">
                <button
                  type="button"
                  class="quality-toggle-pill"
                  :class="{ 'quality-toggle-pill--active': effectiveQuality(row) === 'nq' }"
                  @click.stop="batchStore.setQualityOverride(row.itemId, 'nq')"
                >NQ</button>
                <button
                  type="button"
                  class="quality-toggle-pill quality-toggle-pill--hq"
                  :class="{ 'quality-toggle-pill--active': effectiveQuality(row) === 'hq' }"
                  @click.stop="batchStore.setQualityOverride(row.itemId, 'hq')"
                >HQ</button>
              </div>
              <div v-if="row.isFinishedProduct" class="self-make-toggle">
                <el-switch
                  :model-value="!!batchStore.selfMakeOverrides[row.itemId]"
                  size="small"
                  inline-prompt
                  @change="batchStore.toggleSelfMake(row.itemId)"
                />
                <span class="settings-text">改為自製</span>
              </div>
            </div>
            <CrossWorldPriceDetail
              :data="recommendedRowsFor(row)"
              :loading="crossWorldLoading.has(row.itemId)"
              show-listing-count
            />
          </div>
        </li>
      </ul>
    </div>

    </div>

    <!-- Shopping progress -->
    <div v-if="batchStore.shoppingItemCount > 0" class="shopping-footer">
      <el-divider />
      <el-progress
        :percentage="Math.round((batchStore.shoppingCheckedCount / batchStore.shoppingItemCount) * 100)"
        :stroke-width="10"
        class="shopping-progress"
      />
      <div class="shopping-footer-row">
        <el-text size="small" type="info">
          採購進度：{{ batchStore.shoppingCheckedCount }} / {{ batchStore.shoppingItemCount }} 完成
        </el-text>
        <el-tag v-if="batchStore.allShoppingDone" type="success" size="small">全部採購完成</el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shopping-list {
  container-type: inline-size;
}

.section-label {
  margin-bottom: 8px;
}

.global-quality-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

@media (max-width: 640px) {
  .global-quality-row {
    background: transparent;
    padding: 6px 0 10px;
    margin-bottom: 4px;
    gap: 8px;
  }

  .global-quality-row .section-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 0;
  }
}

.quality-chip {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
}

.quality-pill {
  appearance: none;
  border: none;
  background: transparent;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.quality-pill:hover:not(.quality-pill--active) {
  color: var(--el-text-color-primary);
}

.quality-pill--active {
  background: var(--el-color-info-light-8, var(--el-fill-color-dark));
  color: var(--el-text-color-primary);
}

.quality-pill--hq.quality-pill--active {
  background: color-mix(in oklch, var(--accent-gold) 22%, transparent);
  color: var(--accent-gold);
}

.crystal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.crystal-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 2px;
  vertical-align: middle;
}

.server-grid {
  columns: 1;
  column-gap: 16px;
}

.server-group {
  margin-bottom: 16px;
  break-inside: avoid;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-sm);
  padding: 0 4px;
  /* No bg / border — header is typography; the table below has its own boundary */
}

.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.server-subtotal {
  color: var(--app-text-muted);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .server-header {
    background: transparent;
    border-radius: 0;
    padding: 10px 0 8px;
    margin-bottom: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .server-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    letter-spacing: 0.01em;
  }

  .server-group {
    margin-bottom: 18px;
  }
}

.material-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}

.material-table {
  /* Table IS the data block — same treatment as suggestions-table */
  --el-table-bg-color: var(--app-surface);
  --el-table-tr-bg-color: var(--app-surface);
  --el-table-header-bg-color: oklch(0.955 0.028 80);
  --el-table-row-hover-bg-color: oklch(0.65 0.18 65 / 0.05);
  --el-table-border-color: var(--app-border);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
}

.clickable-rows :deep(.el-table__row) {
  cursor: pointer;
}

.clickable-rows :deep(.row-flash td) {
  background-color: var(--app-accent-glow) !important;
  transition: background-color 0.3s;
}

.clickable-rows :deep(.row-checked td) {
  opacity: 0.45;
  text-decoration: line-through;
}

.clickable-rows :deep(.row-checked:hover td) {
  opacity: 0.65;
}

.shopping-footer {
  margin-top: 4px;
}

.shopping-progress {
  margin-bottom: 8px;
}

.shopping-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.buy-finished-summary {
  margin-bottom: 12px;
}

.buy-finished-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  padding: 4px 0 10px;
}

.buy-finished-note strong {
  color: var(--app-success, var(--el-color-success));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.buy-finished-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-success, var(--el-color-success));
  flex-shrink: 0;
}

.finished-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.craft-compare-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 3px;
}

.material-name-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.expanded-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.quality-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
}

.quality-toggle-pill {
  appearance: none;
  border: none;
  background: transparent;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.quality-toggle-pill:hover:not(.quality-toggle-pill--active) {
  color: var(--el-text-color-primary);
}

.quality-toggle-pill--active {
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
}

.quality-toggle-pill--hq.quality-toggle-pill--active {
  background: color-mix(in oklch, var(--accent-gold) 22%, transparent);
  color: var(--accent-gold);
}

.self-make-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.settings-text {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.material-name-wrap:hover .copy-btn,
.clickable-rows :deep(.el-table__row):hover .copy-btn,
.copy-btn:focus-visible {
  opacity: 1;
}

.copy-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.copy-btn:focus-visible {
  outline: 2px solid var(--page-accent, var(--accent-gold));
  outline-offset: 1px;
}

@media (max-width: 768px) {
  .copy-btn {
    opacity: 1;
  }
}

/* Mobile: reduce table cell padding and tighten column widths for small screens */
@media (max-width: 640px) {
  :deep(.material-table .el-table__cell),
  :deep(.material-table .cell) {
    padding-left: 4px;
    padding-right: 4px;
  }
  :deep(.material-table .el-table__cell) {
    font-size: 12px;
  }
  /* Hide the standalone 小計 column (subtotal is shown via 單價 × 數量) */
  :deep(.material-table .el-table__cell:last-child),
  :deep(.material-table .el-table__header th:last-child) {
    display: none;
  }
}

@media (pointer: coarse) {
  .copy-btn {
    width: 36px;
    height: 36px;
    opacity: 1;
  }
}

.quality-pill,
.quality-toggle-pill {
  min-height: 28px;
}

@media (pointer: coarse) {
  .quality-pill {
    padding: 8px 16px;
    min-height: 36px;
    font-size: 13px;
  }
  .quality-toggle-pill {
    padding: 7px 14px;
    min-height: 32px;
    font-size: 12.5px;
  }
}

@container (min-width: 900px) {
  .server-grid {
    columns: 2;
  }
}

@container (min-width: 1400px) {
  .server-grid {
    columns: 3;
  }
}

/* ===== Mobile card layout (<= 640px) ===== */
.material-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.material-card {
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
  transition: background-color 0.15s, opacity 0.15s;
}

.material-card:last-child {
  border-bottom: none;
}

.material-card--checked .material-card__body {
  opacity: 0.45;
}

.material-card--checked .material-card__name {
  text-decoration: line-through;
}

.material-card--expanded {
  background: color-mix(in oklch, var(--page-accent, var(--accent-gold)) 6%, transparent);
}

.material-card__row {
  display: grid;
  grid-template-columns: 36px 30px 1fr 20px;
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
  cursor: pointer;
  min-height: var(--touch-target-min);
}

.material-card__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--touch-target-min);
}

.material-card__icon {
  width: 28px;
  height: 28px;
  border-radius: 3px;
}

.material-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.material-card__line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--el-text-color-primary);
}

.material-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.material-card__type {
  flex-shrink: 0;
}

.material-card__line2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.material-card__qty {
  font-variant-numeric: tabular-nums;
}

.material-card__price {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}

.material-card__price::before {
  content: '·';
  margin-right: 6px;
  color: var(--el-text-color-placeholder);
}

.material-card__subtotal {
  margin-left: auto;
  color: var(--accent-gold);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 13px;
}

.material-card__hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.material-card__chev {
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s var(--ease-out-quart);
}

.material-card--expanded .material-card__chev {
  transform: rotate(180deg);
  color: var(--page-accent, var(--accent-gold));
}

.material-card__detail {
  padding: 4px 2px 14px;
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: -1px;
}

.material-card__detail .expanded-controls {
  margin-bottom: 8px;
  padding-top: 8px;
}

/* Touch-friendly quality pill sizing inside mobile cards */
.material-card__detail .quality-toggle-pill {
  padding: 10px 16px;
  min-height: var(--touch-target-min);
  font-size: 13px;
}
</style>
