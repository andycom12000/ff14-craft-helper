<script setup lang="ts">
import { computed } from 'vue'
import type { ManualCondition } from '@/stores/simulator'

const props = withDefaults(
  defineProps<{
    modelValue: ManualCondition
    /**
     * When set (typically to `'Good'` by a pending GoodOmen), every chip
     * except the matching one is disabled and the matching chip is shown
     * as auto-selected. The parent stays responsible for actually
     * persisting the forced choice on `change`.
     */
    forcedCondition?: ManualCondition | null
  }>(),
  { forcedCondition: null },
)

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
  // Expert — neutral cocoa palette; never reuse --state-poor.
  { id: 'Centered', label: '安定', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
  { id: 'Sturdy', label: '結實', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
  { id: 'Pliant', label: '高效', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
  { id: 'Malleable', label: '高進度', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
  // Expert (stateful) — same cocoa neutral.
  { id: 'Primed', label: '蓄力', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
  { id: 'GoodOmen', label: '吉兆', kind: 'solid', color: 'var(--brand-cocoa, #8b5e3c)' },
]

const isLocked = computed(() => props.forcedCondition !== null)

function effectiveSelection(chipId: ManualCondition): boolean {
  // Lock takes precedence over modelValue for visual selection: the user's
  // last manual pick is meaningless while the next step is forced.
  if (isLocked.value) return chipId === props.forcedCondition
  return props.modelValue === chipId
}

function isDisabled(chipId: ManualCondition): boolean {
  // While locked, every chip except the forced one is non-interactive.
  return isLocked.value && chipId !== props.forcedCondition
}

function select(c: ManualCondition) {
  if (isDisabled(c)) return
  emit('update:modelValue', c)
  emit('change', c)
}
</script>

<template>
  <div class="condition-chips-wrap">
    <div
      v-if="isLocked"
      class="lock-hint"
      role="status"
      aria-live="polite"
    >
      上一回 <strong>吉兆</strong> 已鎖定下一回 <strong>高品質</strong>
    </div>
    <div
      class="condition-chips"
      role="radiogroup"
      aria-label="下一步球色"
      :aria-disabled="isLocked || undefined"
    >
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="chip"
        :class="{ active: effectiveSelection(chip.id), locked: isLocked && chip.id === forcedCondition }"
        role="radio"
        :aria-checked="effectiveSelection(chip.id)"
        :aria-disabled="isDisabled(chip.id) || undefined"
        :disabled="isDisabled(chip.id)"
        :tabindex="isDisabled(chip.id) ? -1 : 0"
        @click="select(chip.id)"
      >
        <span
          class="dot"
          :class="chip.kind === 'rainbow' ? 'dot-rainbow' : 'dot-solid'"
          :style="chip.kind === 'solid' ? { background: chip.color } : undefined"
        />
        <span class="chip-label">{{ chip.label }}</span>
        <span
          v-if="isLocked && chip.id === forcedCondition"
          class="chip-check"
          aria-hidden="true"
        >✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.condition-chips-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.lock-hint {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--app-text-muted, var(--el-text-color-secondary));
}

.lock-hint strong {
  font-weight: 600;
  color: var(--app-text-strong, var(--el-text-color-primary));
}

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
    color 120ms ease,
    opacity 120ms ease;
}

.chip:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color);
}

.chip.active {
  border-color: var(--app-accent, var(--el-color-primary));
  background: var(--app-accent-glow, rgba(99, 102, 241, 0.12));
  color: var(--el-text-color-primary);
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.chip.locked {
  /* The forced chip gets a stronger emphasis than a regular .active so the
     lock state reads as "system imposed" rather than "user picked". */
  border-color: var(--app-accent, var(--el-color-primary));
  background: var(--app-accent-glow, rgba(99, 102, 241, 0.18));
  color: var(--el-text-color-primary);
  cursor: pointer;
  opacity: 1;
}

.chip-check {
  font-size: 11px;
  line-height: 1;
  color: var(--app-accent, var(--el-color-primary));
}

@media (pointer: coarse) {
  .chip {
    padding: 10px 14px;
    min-height: 44px;
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
