<script setup lang="ts">
import type { BatchTarget } from '@/stores/batch'
import { getJobName } from '@/utils/jobs'
import { starsDisplay } from '@/utils/format'
import { Delete } from '@element-plus/icons-vue'
import ItemName from '@/components/common/ItemName.vue'

defineProps<{ target: BatchTarget }>()
const emit = defineEmits<{
  'update:quantity': [id: number, qty: number]
  remove: [id: number]
}>()
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
      </div>
    </div>
    <div class="recipe-card-controls">
      <el-input-number
        :model-value="target.quantity"
        @update:model-value="(v: number) => emit('update:quantity', target.recipe.id, v)"
        :min="1"
        :max="99"
        size="small"
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
}

.recipe-card-controls {
  display: flex;
  align-items: center;
  gap: 4px;
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
</style>
