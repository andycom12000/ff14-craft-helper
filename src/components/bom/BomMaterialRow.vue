<script setup lang="ts">
import type { MaterialNode } from '@/stores/bom'
import ItemName from '@/components/common/ItemName.vue'
import GilDisplay from '@/components/common/GilDisplay.vue'

type CardVariant = 'root' | 'intermediate' | 'raw'

const VARIANT_CLASS: Record<CardVariant, string> = {
  root: 'root-node',
  intermediate: 'intermediate-node',
  raw: 'raw-node',
}

defineProps<{
  node: MaterialNode
  cardVariant: CardVariant
  unitPrice: number | null
  lineTotal: number | null
  collapsed?: boolean
  rowChecked?: boolean
}>()
</script>

<template>
  <div
    class="tree-node-card"
    :class="[
      VARIANT_CLASS[cardVariant],
      collapsed && 'node-collapsed-card',
      rowChecked && 'row-checked',
    ]"
  >
    <div class="node-content">
      <div class="node-icon-wrapper">
        <img :src="node.icon" :alt="node.name" crossorigin="anonymous" loading="lazy" decoding="async" class="node-icon" />
        <span v-if="node.amount > 1" class="qty-badge">{{ node.amount }}</span>
      </div>
      <span
        class="node-name"
        :class="{ 'name-collapsed': collapsed }"
      >
        <ItemName :item-id="node.itemId" :fallback="node.name" />
      </span>
      <span class="node-price">
        <GilDisplay :value="lineTotal" /> Gil
      </span>
    </div>
    <div v-if="$slots.actions" class="node-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.tree-node-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.node-icon-wrapper {
  position: relative;
  flex-shrink: 0;
}

.node-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  display: block;
}

.qty-badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--el-color-success);
  color: var(--app-text, #fff);
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.node-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-align: center;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  width: 100%;
}

.name-collapsed {
  text-decoration: line-through;
}

.node-price {
  font-size: 11px;
  color: var(--accent-gold, var(--el-text-color-secondary));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-weight: 600;
}

.node-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 6px;
  width: 100%;
}

.node-actions :deep(.el-button) {
  font-size: 11px;
  padding: 4px 6px;
  min-height: 0;
  margin-left: 0 !important;
  width: 100%;
}

.node-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
