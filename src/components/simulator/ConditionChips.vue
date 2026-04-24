<script setup lang="ts">
import type { ManualCondition } from '@/stores/simulator'

defineProps<{
  modelValue: ManualCondition
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ManualCondition]
  change: [value: ManualCondition]
}>()

interface ChipDef {
  id: ManualCondition
  label: string
  kind: 'solid' | 'rainbow'
  color?: string
}

const chips: ChipDef[] = [
  { id: 'Normal', label: '普通', kind: 'solid', color: 'var(--state-normal)' },
  { id: 'Good', label: '高品質', kind: 'solid', color: 'var(--state-good)' },
  { id: 'Excellent', label: '最高品質', kind: 'rainbow' },
  { id: 'Poor', label: '低品質', kind: 'solid', color: 'var(--state-poor)' },
]

function select(c: ManualCondition) {
  emit('update:modelValue', c)
  emit('change', c)
}
</script>

<template>
  <div class="condition-chips" role="radiogroup" aria-label="下一步球色">
    <button
      v-for="chip in chips"
      :key="chip.id"
      type="button"
      class="chip"
      :class="{ active: modelValue === chip.id }"
      role="radio"
      :aria-checked="modelValue === chip.id"
      @click="select(chip.id)"
    >
      <span
        class="dot"
        :class="chip.kind === 'rainbow' ? 'dot-rainbow' : 'dot-solid'"
        :style="chip.kind === 'solid' ? { background: chip.color } : undefined"
      />
      <span class="chip-label">{{ chip.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.condition-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: var(--el-fill-color-light, rgba(255, 255, 255, 0.03));
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;
}

.chip:hover {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color);
}

.chip.active {
  border-color: var(--app-accent, var(--el-color-primary));
  background: var(--app-accent-glow, rgba(99, 102, 241, 0.12));
  color: var(--el-text-color-primary);
}

@media (pointer: coarse) {
  .chip {
    padding: 8px 14px;
    min-height: 36px;
  }
}

.chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
}

.dot-rainbow {
  background: linear-gradient(
    90deg,
    #ef4444,
    #f59e0b,
    #eab308,
    #22c55e,
    #3b82f6
  );
}
</style>
