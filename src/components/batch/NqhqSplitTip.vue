<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MaterialWithPrice } from '@/services/shopping-list'
import { useBatchStore } from '@/stores/batch'

const props = defineProps<{
  items: MaterialWithPrice[]
}>()

const batchStore = useBatchStore()

const hasSplit = computed(() => {
  const seen = new Map<number, Set<'nq' | 'hq'>>()
  for (const it of props.items) {
    if (it.isFinishedProduct) continue
    if (it.type !== 'nq' && it.type !== 'hq') continue
    const set = seen.get(it.itemId) ?? new Set()
    set.add(it.type)
    seen.set(it.itemId, set)
    if (set.size === 2) return true
  }
  return false
})

const collapsing = ref(false)
const popoverOpen = ref(false)

function dismiss() {
  collapsing.value = true
  // Wait for the height/opacity transition before flipping the store flag,
  // so the banner finishes its exit before the chip slot replaces it.
  window.setTimeout(() => {
    batchStore.dismissNqhqTip()
    collapsing.value = false
  }, 220)
}
</script>

<template>
  <div v-if="hasSplit" class="nqhq-tip-slot">
    <!-- First-time banner -->
    <div
      v-if="!batchStore.nqhqTipDismissed"
      class="nqhq-tip-banner"
      :class="{ 'is-collapsing': collapsing }"
      role="status"
      aria-live="polite"
    >
      <span class="nqhq-tip-banner__icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      </span>
      <p class="nqhq-tip-banner__copy">
        <strong>這不是顯示錯誤</strong> — 部分配方需要 HQ 投料以提升起手品質，其他用 NQ 就夠了。系統已自動拆好兩種數量，照著買就行。
      </p>
      <button
        type="button"
        class="nqhq-tip-banner__dismiss"
        @click="dismiss"
      >知道了</button>
    </div>

    <!-- Re-open chip after dismissal -->
    <div v-else class="nqhq-tip-chip-row">
      <el-popover
        v-model:visible="popoverOpen"
        placement="bottom-start"
        trigger="click"
        :width="288"
        popper-class="nqhq-tip-popover"
      >
        <template #reference>
          <button
            type="button"
            class="nqhq-tip-chip"
            aria-label="關於 NQ 與 HQ 拆分的說明"
          >
            <span class="nqhq-tip-chip__mark" aria-hidden="true">?</span>
            <span>為什麼會分 NQ／HQ？</span>
          </button>
        </template>
        <p class="nqhq-tip-popover__copy">
          <strong>這不是顯示錯誤</strong> — 部分配方需要 HQ 投料以提升起手品質，其他用 NQ 就夠了。系統已自動拆好兩種數量，照著買就行。
        </p>
      </el-popover>
    </div>
  </div>
</template>

<style scoped>
.nqhq-tip-slot {
  margin: 0 0 12px;
}

.nqhq-tip-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: var(--buff-info-bg);
  border: 1px solid color-mix(in oklch, var(--buff-info) 30%, transparent);
  overflow: hidden;
  transition:
    opacity 220ms var(--ease-out-quart),
    max-height 220ms var(--ease-out-quart),
    margin 220ms var(--ease-out-quart),
    padding 220ms var(--ease-out-quart),
    border-color 220ms var(--ease-out-quart);
  max-height: 120px;
}

.nqhq-tip-banner.is-collapsing {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-color: transparent;
}

.nqhq-tip-banner__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--buff-info);
}

.nqhq-tip-banner__copy {
  flex: 1;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--app-text, var(--el-text-color-primary));
}

.nqhq-tip-banner__copy strong {
  font-weight: 600;
  color: var(--app-text-primary, var(--el-text-color-primary));
}

.nqhq-tip-banner__dismiss {
  appearance: none;
  border: 1px solid color-mix(in oklch, var(--buff-info) 35%, transparent);
  background: transparent;
  color: color-mix(in oklch, var(--buff-info) 80%, var(--el-text-color-primary));
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
  min-height: 32px;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.nqhq-tip-banner__dismiss:hover {
  background: color-mix(in oklch, var(--buff-info) 14%, transparent);
  color: var(--buff-info);
  border-color: color-mix(in oklch, var(--buff-info) 50%, transparent);
}

.nqhq-tip-banner__dismiss:focus-visible {
  outline: 2px solid var(--buff-info);
  outline-offset: 2px;
}

.nqhq-tip-chip-row {
  display: flex;
  justify-content: flex-end;
}

.nqhq-tip-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px dashed color-mix(in oklch, var(--buff-info) 40%, transparent);
  color: color-mix(in oklch, var(--buff-info) 75%, var(--el-text-color-secondary));
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  min-height: 28px;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.nqhq-tip-chip:hover {
  background: var(--buff-info-bg);
  color: var(--buff-info);
  border-style: solid;
  border-color: color-mix(in oklch, var(--buff-info) 55%, transparent);
}

.nqhq-tip-chip:focus-visible {
  outline: 2px solid var(--buff-info);
  outline-offset: 2px;
}

.nqhq-tip-chip__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

@media (max-width: 640px) {
  .nqhq-tip-banner {
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px 12px;
  }

  .nqhq-tip-banner__copy {
    flex-basis: calc(100% - 26px);
    font-size: 13px;
  }

  .nqhq-tip-banner__dismiss {
    margin-left: auto;
  }

  .nqhq-tip-chip-row {
    justify-content: flex-start;
  }
}
</style>

<style>
.nqhq-tip-popover.el-popover {
  background: var(--app-surface);
  border: 1px solid color-mix(in oklch, var(--buff-info) 30%, transparent);
  color: var(--app-text, var(--el-text-color-primary));
}

.nqhq-tip-popover .nqhq-tip-popover__copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text, var(--el-text-color-primary));
}

.nqhq-tip-popover .nqhq-tip-popover__copy strong {
  font-weight: 600;
}
</style>
