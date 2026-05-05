<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Share, ArrowRight, WarningFilled } from '@element-plus/icons-vue'
import { useBomStore } from '@/stores/bom'
import { buildTeamcraftImportUrl } from '@/services/teamcraft-import'
import { formatGil } from '@/utils/format'

const bom = useBomStore()

defineProps<{
  fetchingPrices?: boolean
}>()

const emit = defineEmits<{
  'refresh-prices': []
  'send-to-batch': []
}>()

const total = computed(() => bom.effectiveGrandTotal)
const baseline = computed(() => bom.marketBaselineTotal)
const savingPct = computed(() => bom.savingPercent)
const hasSaving = computed(() => savingPct.value > 0.5)
const hasLoss = computed(() => savingPct.value < -0.5)
const failedCount = computed(() => bom.failedPriceCount)

async function copyTeamcraftUrl() {
  if (bom.targets.length === 0) {
    ElMessage.warning('清單為空')
    return
  }
  const url = buildTeamcraftImportUrl(
    bom.targets.map((t) => ({
      itemId: t.itemId,
      recipeId: t.recipeId,
      qty: t.quantity,
    })),
  )
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('已複製 Teamcraft 連結')
  } catch {
    ElMessage.error('複製失敗，請手動複製')
    window.prompt('複製這個連結：', url)
  }
}
</script>

<template>
  <div class="totals-bar" role="status">
    <div class="totals-bar__primary">
      <span class="totals-bar__label">總價</span>
      <span class="totals-bar__value">{{ formatGil(total) }}</span>
      <span class="totals-bar__unit">Gil</span>
    </div>

    <div
      v-if="baseline > 0"
      class="totals-bar__saving"
      :data-kind="hasSaving ? 'save' : hasLoss ? 'loss' : 'flat'"
    >
      <span v-if="hasSaving">省 {{ Math.min(99, Math.round(savingPct)) }}%</span>
      <span v-else-if="hasLoss">直購划算</span>
      <span v-else>持平</span>
      <span class="totals-bar__saving-hint">vs 全部市買 {{ formatGil(baseline) }}</span>
    </div>

    <div
      v-if="failedCount > 0"
      class="totals-bar__warn"
      role="alert"
    >
      <el-icon><WarningFilled /></el-icon>
      <span>{{ failedCount }} 列查價失敗</span>
    </div>

    <div class="totals-bar__actions">
      <el-button
        size="small"
        :icon="Refresh"
        :loading="fetchingPrices"
        @click="emit('refresh-prices')"
      >
        重新查價
      </el-button>
      <el-button size="small" :icon="Share" @click="copyTeamcraftUrl">
        分享連結
      </el-button>
      <el-button
        type="primary"
        size="small"
        :icon="ArrowRight"
        :disabled="bom.targets.length === 0"
        @click="emit('send-to-batch')"
      >
        轉到批量計算
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.totals-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  flex-wrap: wrap;
}

.totals-bar__primary {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.totals-bar__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.totals-bar__value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 22px;
  font-weight: 700;
  color: var(--app-accent);
  letter-spacing: -0.01em;
}

.totals-bar__unit {
  font-size: 12px;
  color: var(--app-text-muted);
}

.totals-bar__saving {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 12px;
  border-radius: 8px;
}

.totals-bar__saving[data-kind='save'] {
  background: color-mix(in srgb, var(--app-craft) 10%, transparent);
  color: var(--app-craft);
  font-weight: 600;
}

.totals-bar__saving[data-kind='loss'] {
  background: color-mix(in srgb, var(--app-text-muted) 10%, transparent);
  color: var(--app-text-muted);
}

.totals-bar__saving[data-kind='flat'] {
  color: var(--app-text-muted);
}

.totals-bar__saving > :first-child {
  font-size: 14px;
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: -0.01em;
}

.totals-bar__saving-hint {
  font-size: 11px;
  color: var(--app-text-muted);
  font-weight: 400;
  letter-spacing: 0;
}

.totals-bar__warn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 10%, transparent);
  color: var(--app-warning, oklch(0.45 0.13 55));
  font-size: 12px;
  font-weight: 500;
}

.totals-bar__warn .el-icon {
  font-size: 14px;
}

.totals-bar__actions {
  margin-left: auto;
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .totals-bar {
    gap: 12px;
    padding: 10px 12px;
  }
  .totals-bar__value {
    font-size: 19px;
  }
  .totals-bar__actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>
