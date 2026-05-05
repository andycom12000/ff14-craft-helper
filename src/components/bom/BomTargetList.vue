<script setup lang="ts">
import { useBomStore } from '@/stores/bom'
import { ElMessage } from 'element-plus'
import { Search, Delete, Download } from '@element-plus/icons-vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import ItemName from '@/components/common/ItemName.vue'
import type { BomTarget } from '@/stores/bom'

const bomStore = useBomStore()

const emit = defineEmits<{
  calculate: []
  'open-search': []
  'open-import': []
}>()

function handleQuantityChange(itemId: number, val: number | undefined) {
  bomStore.updateTargetQuantity(itemId, val ?? 1)
}

function handleClearAll() {
  bomStore.clearTargets()
  ElMessage.info('已清除所有目標')
}

function yieldHint(row: BomTarget): string | null {
  const yieldPerCraft = Math.max(1, row.amountResult ?? 1)
  if (yieldPerCraft <= 1) return null
  const crafts = Math.ceil(row.quantity / yieldPerCraft)
  return `每次製作產出 ${yieldPerCraft} 份 → 共 ${crafts} 次製作`
}
</script>

<template>
  <section class="bom-target-list">
    <header class="card-header">
      <span class="card-title">製作目標</span>
      <div class="card-actions">
        <div class="card-actions__primary">
          <el-button type="primary" size="small" :icon="Search" @click="emit('open-search')">
            搜尋
          </el-button>
          <el-button size="small" :icon="Download" @click="emit('open-import')">
            匯入
          </el-button>
        </div>
        <el-popconfirm
          title="確定要清除所有目標嗎？"
          confirm-button-text="確定"
          cancel-button-text="取消"
          @confirm="handleClearAll"
        >
          <template #reference>
            <el-button size="small" text :disabled="bomStore.targets.length === 0">
              清除
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </header>

    <AppEmptyState
      v-if="bomStore.targets.length === 0"
      icon="📜"
      title="建立你的購物清單"
      description="加入想製作的道具，自動計算所需素材和市場價格"
    >
      <div class="empty-actions">
        <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
        <el-button :icon="Download" @click="emit('open-import')">匯入 Teamcraft</el-button>
      </div>
    </AppEmptyState>

    <el-table v-else :data="bomStore.targets" style="width: 100%" class="targets-table">
      <el-table-column label="圖示" width="60" align="center">
        <template #default="{ row }">
          <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" style="width: 28px; height: 28px" />
        </template>
      </el-table-column>
      <el-table-column label="品項名稱" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
          <div v-if="yieldHint(row)" class="target-yield-hint">{{ yieldHint(row) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="數量" width="140" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.quantity"
            :min="1"
            :max="999"
            size="small"
            class="target-qty"
            @change="(val: number | undefined) => handleQuantityChange(row.itemId, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button
            type="danger"
            size="small"
            text
            @click="bomStore.removeTarget(row.itemId)"
          >
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Mobile: compact single-line rows -->
    <ul v-if="bomStore.targets.length > 0" class="targets-mobile-list">
      <li v-for="row in bomStore.targets" :key="row.itemId" class="target-row">
        <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" class="target-row__icon" />
        <span class="target-row__name">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
          <span v-if="yieldHint(row)" class="target-yield-hint">{{ yieldHint(row) }}</span>
        </span>
        <el-input-number
          :model-value="row.quantity"
          :min="1"
          :max="999"
          size="small"
          aria-label="數量"
          class="target-row__qty"
          @change="(val: number | undefined) => handleQuantityChange(row.itemId, val)"
        />
        <button
          type="button"
          class="target-row__remove"
          :aria-label="`移除 ${row.name}`"
          @click="bomStore.removeTarget(row.itemId)"
        >
          <el-icon><Delete /></el-icon>
        </button>
      </li>
    </ul>


  </section>
</template>

<style scoped>
.bom-target-list {
  /* Container query owner so the compact list / table swap follows the
   * actual rendered width, not the viewport. The BOM cockpit rail forces
   * the rail-side instance to ~280–360px regardless of viewport, which
   * the el-table layout (icon 60 + name 180 + qty 140 + ops 80 ≈ 460) can
   * never honor without overflow. */
  container-type: inline-size;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 0 4px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-actions__primary {
  display: inline-flex;
  gap: 6px;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* Table is data inside the rail card — borrow EP table's row dividers but
 * skip the wrapping chrome so it never reads as a card-in-card with the
 * surrounding rail. */
.targets-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-row-hover-bg-color: var(--app-surface-hover);
  --el-table-border-color: var(--app-border);
}

/* Quantity input fills its column — desktop el-input-number defaults to ~150px
 * which forces the column wider than declared and triggers horizontal scroll. */
.target-qty {
  width: 100% !important;
}

.target-yield-hint {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--accent-gold);
  line-height: 1.3;
}

.calculate-row {
  margin-top: 16px;
  text-align: center;
}

.targets-mobile-list {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.target-row {
  display: grid;
  grid-template-columns: 32px 1fr auto 44px;
  align-items: center;
  column-gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  min-height: var(--touch-target-min, 44px);
}

.target-row:last-child {
  border-bottom: none;
}

.target-row__icon {
  width: 28px;
  height: 28px;
  border-radius: 3px;
  flex-shrink: 0;
}

.target-row__name {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.target-row__qty {
  width: 108px;
  flex-shrink: 0;
}

.target-row__qty :deep(.el-input-number__decrease),
.target-row__qty :deep(.el-input-number__increase) {
  background: transparent;
  border-color: transparent;
  color: var(--el-text-color-placeholder);
  transition: color 0.15s, background-color 0.15s;
}

.target-row__qty :deep(.el-input-number__decrease:hover:not(.is-disabled)),
.target-row__qty :deep(.el-input-number__increase:hover:not(.is-disabled)) {
  background: var(--el-fill-color-light);
  color: var(--page-accent, var(--el-color-primary));
}

.target-row__qty :deep(.el-input-number__decrease.is-disabled),
.target-row__qty :deep(.el-input-number__increase.is-disabled) {
  color: var(--el-text-color-disabled);
}

.target-row__qty :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0;
}

.target-row__qty :deep(.el-input__inner) {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.target-row__remove {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--el-text-color-placeholder);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: background-color 0.15s, color 0.15s;
}

.target-row__remove:hover {
  background: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
  color: var(--el-color-danger);
}

.target-row__remove:focus-visible {
  outline: 2px solid var(--page-accent, var(--accent-gold));
  outline-offset: 2px;
  color: var(--el-color-danger);
}

/* Default: table visible, mobile list hidden. EP's el-table is a div tree,
 * not a real <table>, so display:table / table-layout:fixed on the wrapper
 * are inert. Width is governed by EP's column-flex calculation — pinning
 * width on every column + min-width on the flex one keeps it inside container. */
.targets-table {
  width: 100%;
}
.targets-mobile-list {
  display: none;
}

/* Container-driven swap: when the list lives in a narrow rail (cockpit) or on
 * a phone, show the compact row pattern instead of the wide el-table. */
@container (max-width: 480px) {
  .targets-table {
    display: none;
  }
  .targets-mobile-list {
    display: flex;
    border-top: 1px solid var(--app-border);
  }
}

/* Mobile (≤640px viewport): sticky header bar + tighter spacing. */
@media (max-width: 640px) {
  .card-header {
    position: sticky;
    top: var(--mobile-app-bar-h, 52px);
    z-index: 10;
    padding: 10px 12px;
    margin: 0 -12px 0;
    gap: 6px;
    border-bottom: 1px solid var(--app-border);
    background: color-mix(in srgb, var(--app-bg) 88%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .card-header {
      background: var(--app-bg);
    }
  }

  .card-actions {
    gap: 6px;
  }
}
</style>

<!-- Dark mode: hard-coded cream header / faint gold hover wash out on dark.
     Unscoped because [data-theme="dark"] sits on <html>, outside scope. -->
<style>
[data-theme="dark"] .targets-table {
  --el-table-header-bg-color: var(--app-surface-2);
  --el-table-row-hover-bg-color: var(--app-accent-soft);
}
</style>
