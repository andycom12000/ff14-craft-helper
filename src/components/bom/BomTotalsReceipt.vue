<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Share, ArrowRight, ArrowDown, WarningFilled, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useBomStore, getPrice, type AcquisitionSource } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { buildTeamcraftImportUrl } from '@/services/teamcraft-import'
import { formatGil } from '@/utils/format'

const bom = useBomStore()
const settings = useSettingsStore()
const router = useRouter()

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
const targetCount = computed(() => bom.targets.length)

const priceServerNotConfigured = computed(
  () => !settings.server && !settings.dataCenter,
)

function goToSettings() {
  router.push('/settings')
}

// Method distribution — aggregate cost + count per acquisition mode.
// Mirrors effectiveGrandTotal's logic so the four rows always sum to it.
interface MethodSlice {
  source: AcquisitionSource
  label: string
  glyph: string
  count: number
  cost: number | null  // null = "not gil-based" (gather)
}

const methodDistribution = computed<MethodSlice[]>(() => {
  const slices: Record<AcquisitionSource, MethodSlice> = {
    craft:  { source: 'craft',  label: '自製', glyph: '⚒', count: 0, cost: 0 },
    market: { source: 'market', label: '市場', glyph: '⏚', count: 0, cost: 0 },
    gather: { source: 'gather', label: '自採', glyph: '⛏', count: 0, cost: null },
    npc:    { source: 'npc',    label: 'NPC',  glyph: '◷', count: 0, cost: 0 },
  }

  for (const mat of bom.flatMaterials) {
    if (!mat.isRaw) continue
    const mode = bom.getEffectiveMode(mat.itemId)
    const slice = slices[mode]
    slice.count += 1

    if (mode === 'gather') continue

    if (mode === 'npc') {
      const npc = bom.acquisitionAvailability.get(mat.itemId)?.npcPrice
      if (npc != null && slice.cost != null) slice.cost += npc * mat.totalAmount
      continue
    }

    if (mode === 'market') {
      const price = bom.prices.get(mat.itemId)
      if (price && slice.cost != null) {
        slice.cost += getPrice(price, settings.priceDisplayMode) * mat.totalAmount
      }
      continue
    }

    // mode === 'craft' on a raw row means user chose to craft a non-leaf.
    // The actual cost lives in the children (already in flatMaterials), so
    // attribute 0 to this slice and let craft slice's count climb instead.
  }

  return [slices.craft, slices.market, slices.gather, slices.npc]
})

const totalRawCount = computed(() =>
  methodDistribution.value.reduce((s, m) => s + m.count, 0),
)

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
    bom.targets.map((t) => ({ itemId: t.itemId, recipeId: t.recipeId, qty: t.quantity })),
  )
  await copyToClipboard(url, '已複製 Teamcraft 連結')
}

async function copyMaterialsMarkdown() {
  if (bom.flatMaterials.length === 0) {
    ElMessage.warning('還沒計算材料，先按「計算」')
    return
  }
  const lines: string[] = []
  for (const m of bom.flatMaterials) lines.push(`- ×${m.totalAmount} ${m.name}`)
  await copyToClipboard(lines.join('\n'), '已複製材料清單 (Markdown)')
}

function handleShare(action: string) {
  if (action === 'teamcraft') void copyTeamcraftUrl()
  else if (action === 'markdown') void copyMaterialsMarkdown()
}
</script>

<template>
  <section class="receipt" :data-state="hasSaving ? 'save' : hasLoss ? 'loss' : 'flat'">
    <!-- Total hero (left column) — 總價 is the primary number; saving
         is the secondary delight pinned alongside. -->
    <div class="receipt__col receipt__col--hero">
      <div class="receipt__eyebrow">本日結算 · 製作總價</div>
      <div class="receipt__hero">
        <div class="receipt__num">
          {{ formatGil(total) }}<small>Gil</small><span
            v-if="baseline > 0 && (hasSaving || hasLoss)"
            class="receipt__pct"
            :data-kind="hasSaving ? 'save' : 'loss'"
          >
            <span class="receipt__pct-lead">{{ hasSaving ? '省' : '多' }}</span>
            <strong>{{ Math.min(99, Math.round(Math.abs(savingPct))) }}%</strong>
            <span class="receipt__pct-tail">·&nbsp;{{ hasSaving ? '−' : '+' }}{{ formatGil(hasSaving ? savingGil : lossGil) }}</span>
          </span>
        </div>
      </div>
      <p v-if="baseline > 0" class="receipt__caption">
        <template v-if="hasSaving">
          全部市買要 {{ formatGil(baseline) }} Gil，自製省下 {{ formatGil(savingGil) }}。
        </template>
        <template v-else-if="hasLoss">
          全部市買要 {{ formatGil(baseline) }} Gil，自製會多花 {{ formatGil(lossGil) }}。
        </template>
        <template v-else>
          自製和直購差不多，挑你習慣的方式吧。
        </template>
      </p>
      <p v-else class="receipt__caption receipt__caption--muted">
        缺市場基準價，無法估算省下多少。
      </p>
      <div class="receipt__meta">
        <span>{{ targetCount }} 個目標 · {{ totalRawCount }} 件材料</span>
      </div>
    </div>

    <div class="receipt__divider" aria-hidden="true" />

    <!-- Method distribution (middle column) -->
    <div class="receipt__col receipt__col--methods">
      <div class="receipt__eyebrow">方法分布</div>
      <ul class="receipt__rows">
        <li v-for="m in methodDistribution" :key="m.source" class="receipt__row" :data-empty="m.count === 0">
          <span class="receipt__row-glyph" aria-hidden="true">{{ m.glyph }}</span>
          <span class="receipt__row-name">
            {{ m.label }}<small v-if="m.count > 0">{{ m.count }} 件</small>
          </span>
          <span class="receipt__row-amt">
            <template v-if="m.cost == null && m.count > 0">免費</template>
            <template v-else-if="m.count === 0"></template>
            <template v-else>{{ formatGil(m.cost ?? 0) }}</template>
          </span>
        </li>
      </ul>
      <div class="receipt__totals">
        <div class="receipt__totals-line">
          <span>製作總價</span>
          <b>{{ formatGil(total) }} Gil</b>
        </div>
        <div v-if="baseline > 0" class="receipt__totals-line receipt__totals-line--muted">
          <span>vs 全部市買基準</span>
          <s>{{ formatGil(baseline) }} Gil</s>
        </div>
      </div>
    </div>

    <div class="receipt__divider" aria-hidden="true" />

    <!-- Actions (right column) -->
    <div class="receipt__col receipt__col--actions">
      <div class="receipt__eyebrow">操作</div>

      <button
        v-if="priceServerNotConfigured"
        type="button"
        class="receipt__warn-cta"
        @click="goToSettings"
      >
        <el-icon><Setting /></el-icon>
        <span>挑伺服器，才能查市場價</span>
      </button>

      <span
        v-else-if="failedCount > 0"
        class="receipt__warn"
        role="alert"
      >
        <el-icon><WarningFilled /></el-icon>
        <span>{{ failedCount }} 列查價失敗</span>
      </span>

      <div class="receipt__actions">
        <el-button
          size="default"
          :icon="Refresh"
          :loading="fetchingPrices"
          @click="emit('refresh-prices')"
        >
          重新查價
        </el-button>
        <el-dropdown trigger="click" @command="handleShare">
          <el-button size="default" :icon="Share">
            分享
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="teamcraft">複製 Teamcraft 連結</el-dropdown-item>
              <el-dropdown-item command="markdown">複製材料清單 (Markdown)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button
          size="default"
          :icon="ArrowRight"
          :disabled="bom.targets.length === 0"
          class="receipt__send-action"
          @click="emit('send-to-batch')"
        >
          送往批量
        </el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.receipt {
  background: var(--app-cream-emphasis, oklch(0.93 0.04 80));
  background-image:
    radial-gradient(circle at 30% 20%, oklch(0.65 0.04 65 / 0.04) 0 1px, transparent 1.5px),
    radial-gradient(circle at 70% 60%, oklch(0.65 0.04 65 / 0.04) 0 1px, transparent 1.5px);
  background-size: 32px 32px, 48px 48px;
  border: 1px solid var(--app-border-strong, var(--app-border));
  border-radius: 14px;
  padding: 22px 26px 18px;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.6);
  display: grid;
  grid-template-columns: 1.1fr 1px 1.4fr 1px 1fr;
  gap: 22px;
  align-items: stretch;
  margin-bottom: 16px;
  color: var(--app-text);
}

:root[data-theme='dark'] .receipt {
  background: color-mix(in srgb, var(--app-craft) 8%, var(--app-surface));
  background-image: none;
  box-shadow: none;
  border-color: color-mix(in srgb, var(--app-craft) 30%, var(--app-border));
}

.receipt__col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.receipt__divider {
  background: var(--app-border);
  width: 1px;
}

.receipt__eyebrow {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10.5px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--app-craft);
  margin-bottom: 2px;
}

/* ── Hero column ────────────────────────────────────────────── */
.receipt__hero {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.receipt__num {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-weight: 600;
  font-size: clamp(52px, 6vw, 72px);
  line-height: 0.95;
  letter-spacing: -0.025em;
  /* Total is the hero — primary ink, not cocoa. Cocoa stays reserved
   * for the saving chip so the eye reads the total first, then sees
   * "and you saved X" as the secondary delight. */
  color: var(--app-text);
}

.receipt__num small {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-style: normal;
  font-weight: 500;
  font-size: 13px;
  color: var(--app-text-muted);
  margin-left: 6px;
  letter-spacing: 0.04em;
  vertical-align: 0.6em;
}

.receipt__pct {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 500;
  font-size: 12px;
  color: var(--app-craft);
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-craft) 26%, transparent);
  border-radius: 999px;
  padding: 4px 11px;
  margin-left: 14px;
  letter-spacing: 0.02em;
  /* Pill sits inline next to "Gil" inside .receipt__num — match the
     small's vertical-align so they share the same horizontal level. */
  vertical-align: 0.6em;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
  font-style: normal;
}

.receipt__pct[data-kind='loss'] {
  color: var(--app-warning, oklch(0.55 0.14 55));
  background: color-mix(in srgb, var(--app-warning, oklch(0.55 0.14 55)) 12%, transparent);
  border-color: color-mix(in srgb, var(--app-warning, oklch(0.55 0.14 55)) 28%, transparent);
}

.receipt__pct-lead {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.85;
}

.receipt__pct strong {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
}

.receipt__pct-tail {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.8;
  letter-spacing: 0.02em;
}

.receipt__caption {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 16px;
  color: var(--app-text);
  line-height: 1.4;
  margin: 4px 0 0;
}

.receipt__caption--muted {
  color: var(--app-text-muted);
}

.receipt__meta {
  margin-top: auto;
  padding-top: 10px;
  font-size: 12px;
  color: var(--app-text-muted);
}

/* ── Methods column ─────────────────────────────────────────── */
.receipt__rows {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.receipt__row {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 10px;
  align-items: baseline;
  padding: 5px 0;
  border-bottom: 1px dashed var(--app-border);
  font-size: 13px;
}

.receipt__row:last-of-type {
  border-bottom: none;
}

.receipt__row[data-empty='true'] {
  opacity: 0.45;
}

.receipt__row-glyph {
  color: var(--app-craft);
  text-align: center;
  font-size: 14px;
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Symbola',
    'Noto Sans TC', sans-serif;
}

.receipt__row-name {
  color: var(--app-text);
}

.receipt__row-name small {
  color: var(--app-text-muted);
  margin-left: 6px;
  font-size: 11.5px;
}

.receipt__row-amt {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--app-text);
}

.receipt__totals {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.receipt__totals-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.receipt__totals-line b {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 600;
  color: var(--app-text);
  font-size: 13px;
  letter-spacing: 0.02em;
}

.receipt__totals-line s {
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text-faint, var(--app-text-muted));
  text-decoration-color: color-mix(in srgb, var(--app-text-muted) 60%, transparent);
  font-size: 13px;
}

/* ── Actions column ────────────────────────────────────────── */
.receipt__col--actions {
  align-items: flex-start;
}

.receipt__warn,
.receipt__warn-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  align-self: flex-start;
}

.receipt__warn {
  background: color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 12%, transparent);
  color: var(--app-warning, oklch(0.45 0.13 55));
  border: 1px solid color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 30%, transparent);
}

.receipt__warn-cta {
  border: 1px solid color-mix(in srgb, var(--app-craft) 30%, transparent);
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
  color: var(--app-craft);
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.02em;
  transition: background-color 0.12s ease-out;
}

.receipt__warn-cta:hover {
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
}

.receipt__warn .el-icon,
.receipt__warn-cta .el-icon {
  font-size: 13px;
}

.receipt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  width: 100%;
}

/* EP redeclares --el-button-bg-color on .el-button itself, so the override
 * has to live at button scope, not on the parent. */
.receipt__actions :deep(.el-button) {
  --el-button-bg-color: var(--app-surface);
  --el-button-text-color: var(--app-text);
  --el-button-border-color: var(--app-border);
  --el-button-hover-bg-color: color-mix(in oklab, var(--app-craft) 6%, var(--app-surface));
  --el-button-hover-text-color: var(--app-craft);
  --el-button-hover-border-color: color-mix(in oklab, var(--app-craft) 35%, var(--app-border));
}

.receipt__send-action {
  background: color-mix(in oklab, var(--app-craft) 9%, var(--app-surface));
  border-color: color-mix(in oklab, var(--app-craft) 45%, var(--app-border));
  color: var(--app-craft);
}

.receipt__send-action:hover,
.receipt__send-action:focus-visible {
  background: color-mix(in oklab, var(--app-craft) 16%, var(--app-surface));
  border-color: var(--app-craft);
  color: var(--app-craft);
}

.receipt__send-action:is(.is-disabled, [disabled]) {
  background: var(--app-surface);
  border-color: var(--app-border);
  color: var(--app-text-muted);
}

/* ── Responsive collapse ───────────────────────────────────── */
@media (max-width: 1100px) {
  .receipt {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
  }
  .receipt__col--hero {
    grid-column: 1 / -1;
  }
  .receipt__divider {
    display: none;
  }
  .receipt__col--methods {
    border-top: 1px dashed var(--app-border);
    padding-top: 14px;
  }
  .receipt__col--actions {
    border-top: 1px dashed var(--app-border);
    padding-top: 14px;
  }
}

@media (max-width: 720px) {
  .receipt {
    grid-template-columns: 1fr;
    padding: 16px 18px 14px;
    gap: 14px;
  }
  .receipt__num {
    font-size: clamp(40px, 12vw, 52px);
  }
  .receipt__col--methods,
  .receipt__col--actions {
    border-top: 1px dashed var(--app-border);
    padding-top: 12px;
  }
  .receipt__actions {
    width: 100%;
    margin-top: 4px;
  }
  .receipt__actions :deep(.el-button) {
    flex: 1 1 auto;
    min-height: var(--touch-target-min, 44px);
  }
}
</style>
