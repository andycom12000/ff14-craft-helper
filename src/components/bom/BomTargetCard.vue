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

const yieldPerCraft = computed(() => Math.max(1, props.target.amountResult ?? 1))
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
.bom-target-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px 10px 12px;
  border-radius: 10px;
  background: var(--app-cream-surface, var(--app-surface));
  border: 1px solid var(--app-border);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.5),
    0 1px 3px oklch(0.40 0.05 60 / 0.06);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.bom-target-card:hover {
  border-color: color-mix(in srgb, var(--app-craft) 35%, var(--app-border));
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.5),
    0 2px 8px oklch(0.40 0.05 60 / 0.10);
}

.bom-target-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--app-bg);
}

.bom-target-card__icon--empty {
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
  font-size: 14.5px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bom-target-card__hint {
  font-size: 11.5px;
  color: var(--app-toast-gold, var(--accent-gold));
  line-height: 1.3;
}

.bom-target-card__controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Tighten the el-input-number footprint so two cards fit comfortably in
 * a 2-col grid without forcing the controls column wide. */
.bom-target-card__controls :deep(.el-input-number) {
  width: 96px;
}
</style>
