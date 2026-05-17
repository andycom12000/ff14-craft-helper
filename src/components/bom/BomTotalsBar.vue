<script setup lang="ts">
/**
 * Slim sticky strip — the condensed counterpart to BomTotalsReceipt.
 * Renders the same data points (total / saving / method distribution /
 * actions) at compact height for the pinned sticky band that follows
 * the user as they scroll past the full receipt.
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Share, ArrowRight, ArrowDown, WarningFilled, Setting, MoreFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useBomStore, type AcquisitionSource } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { buildTeamcraftImportUrl } from '@/services/teamcraft-import'
import { formatGil } from '@/utils/format'
import { trackEvent } from '@/utils/analytics'

const bom = useBomStore()
const settings = useSettingsStore()
const router = useRouter()

const priceServerNotConfigured = computed(
  () => !settings.server && !settings.dataCenter,
)

function goToSettings() {
  router.push('/settings')
}

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
const savingGil = computed(() => Math.max(0, baseline.value - total.value))
const lossGil = computed(() => Math.max(0, total.value - baseline.value))
const hasSaving = computed(() => savingPct.value > 0.5)
const hasLoss = computed(() => savingPct.value < -0.5)
const failedCount = computed(() => bom.failedPriceCount)

interface MethodSlice {
  source: AcquisitionSource
  glyph: string
  label: string
  count: number
}

const methodCounts = computed<MethodSlice[]>(() => {
  const slices: Record<AcquisitionSource, MethodSlice> = {
    craft:  { source: 'craft',  glyph: '⚒', label: '自製', count: 0 },
    market: { source: 'market', glyph: '⏚', label: '市場', count: 0 },
    gather: { source: 'gather', glyph: '⛏', label: '自採', count: 0 },
    npc:    { source: 'npc',    glyph: '◷', label: 'NPC',  count: 0 },
  }
  for (const mat of bom.flatMaterials) {
    if (!mat.isRaw) continue
    slices[bom.getEffectiveMode(mat.itemId)].count += 1
  }
  return [slices.craft, slices.market, slices.gather, slices.npc].filter((s) => s.count > 0)
})

async function copyToClipboard(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMsg)
  } catch {
    ElMessage.error('複製失敗，請手動複製')
    window.prompt('複製這段內容：', text)
  }
}

async function copyTeamcraftUrl() {
  if (bom.targets.length === 0) {
    ElMessage.warning('清單為空')
    return
  }
  const url = buildTeamcraftImportUrl(
    bom.targets.map((t) => ({ itemId: t.itemId, recipeId: t.kind === 'recipe' ? t.recipeId : null, qty: t.quantity })),
  )
  trackEvent('bom_copy_list', { format: 'teamcraft', target_count: bom.targets.length })
  await copyToClipboard(url, '已複製 Teamcraft 連結')
}

async function copyMaterialsMarkdown() {
  if (bom.flatMaterials.length === 0) {
    ElMessage.warning('還沒計算材料，先按「計算」')
    return
  }
  const lines: string[] = []
  for (const m of bom.flatMaterials) lines.push(`- ×${m.totalAmount} ${m.name}`)
  trackEvent('bom_copy_list', { format: 'markdown', target_count: bom.targets.length })
  await copyToClipboard(lines.join('\n'), '已複製材料清單 (Markdown)')
}

function handleShare(action: string) {
  if (action === 'teamcraft') void copyTeamcraftUrl()
  else if (action === 'markdown') void copyMaterialsMarkdown()
}
</script>

<template>
  <div
    class="strip"
    role="status"
    :data-state="hasSaving ? 'save' : hasLoss ? 'loss' : 'flat'"
  >
    <!-- Total hero (compact) — 總價 leads, saving sits beside as a chip -->
    <div class="strip__hero">
      <span class="strip__num">
        {{ formatGil(total) }}<small>Gil</small>
      </span>
      <span
        v-if="baseline > 0 && (hasSaving || hasLoss)"
        class="strip__pct"
        :data-kind="hasSaving ? 'save' : 'loss'"
      >
        {{ hasSaving ? '省' : '多花' }}
        {{ Math.min(99, Math.round(Math.abs(savingPct))) }}%
        ·
        {{ hasSaving ? '−' : '+' }}{{ formatGil(hasSaving ? savingGil : lossGil) }}
      </span>
    </div>

    <!-- Method counts trail. Hidden when no methods picked yet (would be
         empty noise) and falls back to the price-server CTA when missing. -->
    <div class="strip__trail">
      <template v-if="!priceServerNotConfigured">
        <span
          v-for="m in methodCounts"
          :key="m.source"
          class="strip__method"
          :title="`${m.label} ${m.count} 件`"
        >
          <span class="strip__method-glyph" aria-hidden="true">{{ m.glyph }}</span>
          <span class="strip__method-name">{{ m.label }}</span>
          <span class="strip__method-count">×{{ m.count }}</span>
        </span>
        <span v-if="failedCount > 0" class="strip__trail-warn" role="alert">
          <el-icon><WarningFilled /></el-icon>
          {{ failedCount }} 列待補
        </span>
      </template>
    </div>

    <!-- Settings CTA shifts to the trail's place when no server picked yet. -->
    <button
      v-if="priceServerNotConfigured"
      type="button"
      class="strip__warn-cta"
      @click="goToSettings"
    >
      <el-icon><Setting /></el-icon>
      <span>挑伺服器</span>
    </button>

    <!-- Actions -->
    <div class="strip__actions">
      <el-button
        size="small"
        :icon="Refresh"
        :loading="fetchingPrices"
        @click="emit('refresh-prices')"
      >
        <span class="strip__action-label">重新查價</span>
        <span class="strip__action-label-short">查價</span>
      </el-button>
      <el-button
        type="primary"
        size="small"
        :icon="ArrowRight"
        :disabled="bom.targets.length === 0"
        class="strip__primary"
        @click="emit('send-to-batch')"
      >
        <span class="strip__action-label">送往批量計算</span>
        <span class="strip__action-label-short">送往批量</span>
      </el-button>
      <el-dropdown trigger="click" @command="handleShare">
        <el-button size="small" :icon="MoreFilled" aria-label="更多動作" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="teamcraft">
              <el-icon><Share /></el-icon>
              複製 Teamcraft 連結
            </el-dropdown-item>
            <el-dropdown-item command="markdown">
              <el-icon><ArrowDown /></el-icon>
              複製材料清單 (Markdown)
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--app-cream-emphasis, var(--app-surface)) 90%, transparent);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  backdrop-filter: blur(8px);
}

:root[data-theme='dark'] .strip {
  background: color-mix(in srgb, var(--app-craft) 10%, var(--app-surface));
  border-color: color-mix(in srgb, var(--app-craft) 25%, var(--app-border));
}

/* ── Hero block ────────────────────────────────────────────── */
.strip__hero {
  display: inline-flex;
  /* Center, not baseline — at this strip's compact height baseline drops
     the small Gil + saving pill to the bottom of the big-number row,
     misaligned with the method counts and action buttons. */
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.strip__num {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 30px;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.strip__num small {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-style: normal;
  font-size: 12px;
  margin-left: 5px;
  color: var(--app-text-muted);
  font-weight: 500;
  letter-spacing: 0.04em;
}

.strip__pct {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-craft);
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-craft) 26%, transparent);
  border-radius: 999px;
  padding: 3px 10px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.strip__pct[data-kind='loss'] {
  color: var(--app-warning, oklch(0.55 0.14 55));
  background: color-mix(in srgb, var(--app-warning, oklch(0.55 0.14 55)) 12%, transparent);
  border-color: color-mix(in srgb, var(--app-warning, oklch(0.55 0.14 55)) 28%, transparent);
}

/* ── Method counts trail ───────────────────────────────────── */
.strip__trail {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--app-text-muted);
  min-width: 0;
}

.strip__method {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.strip__method-glyph {
  color: var(--app-craft);
  font-size: 13px;
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Symbola',
    'Noto Sans TC', sans-serif;
  line-height: 1;
}

.strip__method-name {
  color: var(--app-text);
  font-size: 12px;
}

.strip__method-count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-muted);
  letter-spacing: 0.02em;
}

.strip__trail-warn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-warning, oklch(0.55 0.14 55));
  font-weight: 500;
  font-size: 12px;
}

.strip__trail-warn .el-icon {
  font-size: 12px;
}

.strip__warn-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--app-craft) 30%, transparent);
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
  color: var(--app-craft);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.strip__warn-cta:hover {
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
}

/* ── Actions ────────────────────────────────────────────────── */
.strip__actions {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}

.strip__primary {
  background: var(--app-craft);
  border-color: var(--app-craft);
}

.strip__primary:hover {
  background: oklch(from var(--app-craft) calc(l + 0.06) c h);
  border-color: oklch(from var(--app-craft) calc(l + 0.06) c h);
}

.strip__action-label-short {
  display: none;
}

/* ── Responsive ────────────────────────────────────────────── */
@media (max-width: 1280px) {
  .strip__action-label { display: none; }
  .strip__action-label-short { display: inline; }
  .strip__method-name { display: none; }
}

@media (max-width: 900px) {
  .strip {
    grid-template-columns: 1fr auto;
    gap: 10px;
    padding: 8px 12px;
  }
  .strip__trail {
    grid-column: 1 / -1;
    order: 3;
    border-top: 1px dashed var(--app-border);
    padding-top: 6px;
    width: 100%;
  }
  .strip__num { font-size: 24px; }
  .strip__pct { font-size: 11px; padding: 3px 9px; }
}

@media (max-width: 640px) {
  .strip {
    padding: 8px 10px;
    gap: 8px;
  }
  .strip__hero { gap: 8px; }
  .strip__actions { gap: 4px; }
}
</style>
