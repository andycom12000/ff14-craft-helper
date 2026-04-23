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
        <img :src="node.icon" :alt="node.name" crossorigin="anonymous" class="node-icon" />
        <span v-if="node.amount > 1" class="qty-badge">{{ node.amount }}</span>
      </div>
      <div class="node-info">
        <div class="node-price-row">
          <span
            class="node-price-left"
            :class="{ 'name-collapsed': collapsed }"
          >
            <ItemName :item-id="node.itemId" :fallback="node.name" />
          </span>
          <span class="node-price-right">
            <GilDisplay :value="unitPrice" /> × {{ node.amount }}
            = <GilDisplay :value="lineTotal" /> Gil
          </span>
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="node-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
