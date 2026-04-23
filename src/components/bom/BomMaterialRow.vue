<script setup lang="ts">
import type { MaterialNode } from '@/stores/bom'
import ItemName from '@/components/common/ItemName.vue'
import GilDisplay from '@/components/common/GilDisplay.vue'

defineProps<{
  node: MaterialNode
  /** Visual variant — drives the outer `tree-node-card` class. */
  cardVariant: 'root' | 'intermediate' | 'raw'
  /** Unit price for this item (null = market data unknown). */
  unitPrice: number | null
  /** Line total = unitPrice * amount (null when unit is unknown). */
  lineTotal: number | null
  /** When true the row is rendered in the "collapsed" craftable style. */
  collapsed?: boolean
  /** When true the row is marked as already shopped (visually dimmed). */
  rowChecked?: boolean
}>()
</script>

<template>
  <div
    class="tree-node-card"
    :class="[
      cardVariant === 'root' && 'root-node',
      cardVariant === 'intermediate' && 'intermediate-node',
      cardVariant === 'raw' && 'raw-node',
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
