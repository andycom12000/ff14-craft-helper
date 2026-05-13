<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import ItemName from '@/components/common/ItemName.vue'
import type { BomTarget } from '@/stores/bom'

const props = defineProps<{ target: BomTarget }>()
const emit = defineEmits<{
  'update:quantity': [itemId: number, qty: number]
  remove: [itemId: number]
}>()

const yieldPerCraft = computed(() => Math.max(1, (props.target.kind === 'recipe' ? props.target.amountResult : undefined) ?? 1))
const crafts = computed(() => Math.ceil(props.target.quantity / yieldPerCraft.value))
const showYieldHint = computed(() => yieldPerCraft.value > 1)
</script>

<template>
  <div class="bom-target-card">
    <img
      v-if="target.icon"
      :src="target.icon"
      :alt="target.name"
      crossorigin="anonymous"
      loading="lazy"
      decoding="async"
      class="bom-target-card__icon"
    />
    <div v-else class="bom-target-card__icon bom-target-card__icon--empty" />

    <div class="bom-target-card__info">
      <div class="bom-target-card__name">
        <ItemName :item-id="target.itemId" :fallback="target.name" />
      </div>
      <div v-if="showYieldHint" class="bom-target-card__hint">
        每次製作產出 {{ yieldPerCraft }} 份 → 共 {{ crafts }} 次製作
      </div>
    </div>

    <div class="bom-target-card__controls">
      <el-input-number
        :model-value="target.quantity"
        :min="1"
        :max="999"
        size="small"
        :aria-label="`數量：${target.name}`"
        @update:model-value="(v: number) => emit('update:quantity', target.itemId, v)"
      />
      <el-button
        :icon="Delete"
        size="small"
        type="danger"
        text
        :aria-label="`移除 ${target.name}`"
        @click="emit('remove', target.itemId)"
      />
    </div>
  </div>
</template>

<style scoped>
/* Mirrors .recipe-card in BatchRecipeCard so the two pages' prepare lists
 * read as siblings — same chrome, same hover, same icon scale. The only
 * shape difference is BOM's narrower input-number (96px vs Batch's wider
 * default) since BOM rows don't carry a level/job pill. */
.bom-target-card {
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

.bom-target-card:hover {
  background: oklch(0.96 0.028 82);
  border-color: oklch(0.55 0.05 60 / 0.32);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.7),
    0 6px 16px oklch(0.40 0.05 60 / 0.14);
  transform: translateY(-1px);
}

:root[data-theme='dark'] .bom-target-card {
  background: var(--app-cream-surface, var(--app-surface));
  border-color: var(--app-border);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.05),
    0 2px 6px oklch(0 0 0 / 0.20);
}

:root[data-theme='dark'] .bom-target-card:hover {
  border-color: color-mix(in srgb, var(--app-craft) 40%, var(--app-border));
  background: color-mix(in srgb, var(--app-craft) 4%, var(--app-cream-surface, var(--app-surface)));
}

.bom-target-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  flex-shrink: 0;
}

.bom-target-card__icon--empty {
  background: var(--el-fill-color-light);
  border: 1px dashed var(--app-border);
}

.bom-target-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bom-target-card__name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bom-target-card__hint {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--app-toast-gold, var(--accent-gold));
  line-height: 1.35;
}

.bom-target-card__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Tighten the el-input-number footprint so two cards fit comfortably in
 * a 2-col grid without forcing the controls column wide. */
.bom-target-card__controls :deep(.el-input-number) {
  width: 96px;
}

@media (max-width: 640px) {
  .bom-target-card {
    padding: 10px 12px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .bom-target-card__icon {
    width: 36px;
    height: 36px;
  }
  .bom-target-card__name {
    font-size: 13.5px;
  }
  .bom-target-card__controls {
    order: 3;
    width: 100%;
    justify-content: flex-end;
    margin-top: 2px;
  }
}
</style>
