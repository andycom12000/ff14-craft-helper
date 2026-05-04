<script setup lang="ts">
import { computed } from 'vue'
import type { BatchTarget } from '@/stores/batch'
import { getJobName } from '@/utils/jobs'
import { starsDisplay } from '@/utils/format'
import { Delete } from '@element-plus/icons-vue'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{
  target: BatchTarget
  gearsetLevel?: number | null
}>()
const emit = defineEmits<{
  'update:quantity': [id: number, qty: number]
  remove: [id: number]
  'open-gearset': [job: string]
}>()

const recipeLevel = computed(() => props.target.recipe.recipeLevelTable.classJobLevel)
const isLevelLow = computed(() => {
  if (props.gearsetLevel == null) return false
  if (props.gearsetLevel <= 0) return false
  return props.gearsetLevel < recipeLevel.value
})

// Items per craft. Food/medicine usually yield 3, everything else 1.
const yieldPerCraft = computed(() => Math.max(1, props.target.recipe.amountResult ?? 1))
// Crafts needed to produce target.quantity items, rounded up.
const crafts = computed(() => Math.ceil(props.target.quantity / yieldPerCraft.value))
// Show the per-craft yield hint only when it's not the trivial 1:1 case.
const showYieldHint = computed(() => yieldPerCraft.value > 1)
</script>

<template>
  <div class="recipe-card">
    <img
      v-if="target.recipe.icon"
      :src="target.recipe.icon"
      :alt="target.recipe.name"
      loading="lazy"
      decoding="async"
      class="recipe-card-icon"
    />
    <div class="recipe-card-icon recipe-card-icon--empty" v-else />
    <div class="recipe-card-info">
      <div class="recipe-card-name">
        <ItemName :item-id="target.recipe.itemId" :fallback="target.recipe.name" />
      </div>
      <div class="recipe-card-meta">
        Lv.{{ target.recipe.recipeLevelTable.classJobLevel }}
        {{ starsDisplay(target.recipe.stars) }}
        <el-tag size="small" type="primary">{{ getJobName(target.recipe.job) }}</el-tag>
        <button
          v-if="isLevelLow"
          type="button"
          class="recipe-card-lvl-pill"
          :title="`你的 ${getJobName(target.recipe.job)} 等級不夠，遊戲目前禁止製作`"
          @click="emit('open-gearset', target.recipe.job)"
        >
          Lv {{ gearsetLevel }} · 需 {{ recipeLevel }}
        </button>
        <span class="recipe-card-qty">× {{ target.quantity }} 份</span>
      </div>
      <div v-if="showYieldHint" class="recipe-card-hint">
        每次製作產出 {{ yieldPerCraft }} 份 → 共 {{ crafts }} 次製作
      </div>
    </div>
    <div class="recipe-card-controls">
      <el-input-number
        :model-value="target.quantity"
        @update:model-value="(v: number) => emit('update:quantity', target.recipe.id, v)"
        :min="1"
        :max="99"
        size="small"
        :aria-label="`想要的份數：${target.recipe.name}`"
      />
      <el-button
        :icon="Delete"
        size="small"
        type="danger"
        text
        :aria-label="`移除 ${target.recipe.name}`"
        @click="emit('remove', target.recipe.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.recipe-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 12px 16px;
  border-radius: 10px;
  background: oklch(0.97 0.022 85);
  border: 1px solid oklch(0.55 0.05 60 / 0.20);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.7),
    0 2px 6px oklch(0.40 0.05 60 / 0.12);
  transition:
    background-color 0.18s var(--ease-out-quart),
    border-color 0.18s var(--ease-out-quart),
    box-shadow 0.18s var(--ease-out-quart),
    transform 0.18s var(--ease-out-quart);
}

.recipe-card:hover {
  background: oklch(0.96 0.028 82);
  border-color: oklch(0.55 0.05 60 / 0.32);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.7),
    0 6px 16px oklch(0.40 0.05 60 / 0.14);
  transform: translateY(-1px);
}

.recipe-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  flex-shrink: 0;
}

.recipe-card-icon--empty {
  background: var(--el-fill-color-light);
}

.recipe-card-info {
  flex: 1;
  min-width: 0;
}

.recipe-card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-card-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.recipe-card-qty {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.recipe-card-hint {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--accent-gold);
  line-height: 1.35;
}

.recipe-card-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .recipe-card {
    padding: 10px 12px;
    gap: 10px;
    flex-wrap: wrap;
  }

  .recipe-card-icon {
    width: 36px;
    height: 36px;
  }

  .recipe-card-info {
    flex: 1 1 0;
    min-width: 0;
  }

  .recipe-card-name {
    font-size: 13.5px;
  }

  .recipe-card-meta {
    flex-wrap: wrap;
    gap: 4px;
    font-size: 11.5px;
  }

  /* Quantity + delete wrap to a dedicated row so the name/meta gets full width.
   * Override the global 44px-target padding on input-number: the +/- buttons
   * remain tappable via explicit sizing below without stealing 96px of width. */
  .recipe-card-controls {
    order: 3;
    width: 100%;
    justify-content: flex-end;
    margin-top: 2px;
  }

  .recipe-card-controls :deep(.el-input-number.el-input-number--small) {
    width: 112px;
    line-height: normal;
  }

  .recipe-card-controls :deep(.el-input-number--small .el-input__wrapper) {
    padding-left: 36px;
    padding-right: 36px;
    min-height: 36px;
  }

  .recipe-card-controls :deep(.el-input-number--small .el-input__inner) {
    height: 34px;
    line-height: 34px;
  }

  .recipe-card-controls :deep(.el-input-number--small .el-input-number__decrease),
  .recipe-card-controls :deep(.el-input-number--small .el-input-number__increase) {
    min-width: 36px;
    min-height: 36px;
  }

  .recipe-card-controls :deep(.el-button) {
    min-height: 36px;
    min-width: 36px;
    padding: 0 10px;
  }
}
</style>

<!-- Dark mode overrides — paper-card cream + white inset highlight don't
     translate; replace with cool gradient + subtle warm inset. Unscoped
     because [data-theme="dark"] lives on <html>, outside scope. -->
<style>
[data-theme="dark"] .recipe-card {
  background: linear-gradient(135deg, oklch(0.24 0.012 60) 0%, oklch(0.20 0.008 60) 100%);
  border-color: var(--app-border);
  box-shadow:
    inset 0 1px 0 oklch(0.50 0.04 60 / 0.20),
    0 2px 6px oklch(0.05 0.02 60 / 0.40);
}
[data-theme="dark"] .recipe-card:hover {
  background: linear-gradient(135deg, oklch(0.27 0.014 60) 0%, oklch(0.23 0.010 60) 100%);
  border-color: var(--app-accent);
  box-shadow:
    inset 0 1px 0 oklch(0.50 0.04 60 / 0.24),
    0 6px 16px oklch(0.05 0.02 60 / 0.50);
}

.recipe-card-lvl-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-craft) 32%, transparent);
  color: var(--app-craft);
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 0.18s var(--ease-out-quart);
}
.recipe-card-lvl-pill:hover {
  background: color-mix(in srgb, var(--app-craft) 20%, transparent);
}
.recipe-card-lvl-pill:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}
</style>
