<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

export interface FlowStep {
  label: string
  path?: string
  icon: string
}

const props = defineProps<{
  steps: FlowStep[]
  /** Step-based mode: pass current step index (0-based). Overrides route-based detection. */
  activeStep?: number
}>()

const emit = defineEmits<{
  navigate: [step: number]
}>()

const route = useRoute()
const router = useRouter()

const isStepMode = computed(() => props.activeStep !== undefined)

const currentIndex = computed(() => {
  if (isStepMode.value) return props.activeStep!
  return props.steps.findIndex(s => s.path === route.path)
})

function handleClick(i: number, step: FlowStep) {
  if (isStepMode.value) {
    emit('navigate', i)
  } else if (step.path) {
    router.push(step.path)
  }
}
</script>

<template>
  <nav class="flow-breadcrumb" aria-label="製作流程">
    <template v-for="(step, i) in steps" :key="i">
      <button
        class="flow-step"
        :class="{
          active: i === currentIndex,
          done: i < currentIndex,
          future: i > currentIndex
        }"
        @click="handleClick(i, step)"
      >
        <span class="flow-icon" aria-hidden="true">{{ i < currentIndex ? '✓' : step.icon }}</span>
        <span class="flow-label">{{ step.label }}</span>
      </button>
      <span v-if="i < steps.length - 1" class="flow-arrow" aria-hidden="true">›</span>
    </template>
  </nav>
</template>

<style scoped>
.flow-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 20px;
  padding: 8px 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  width: fit-content;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.flow-step.active {
  background: var(--page-accent-dim, rgba(124, 58, 237, 0.15));
  color: var(--page-accent, var(--app-accent-light));
  font-weight: 600;
}

.flow-step.done {
  color: var(--app-success);
}

.flow-step.future {
  color: var(--app-text-muted);
}

.flow-step:hover:not(.active) {
  background: rgba(148, 163, 184, 0.08);
  color: var(--app-text);
}

.flow-icon { font-size: 14px; }
.flow-label { font-size: 13px; }

.flow-arrow {
  color: var(--app-text-muted);
  font-size: 16px;
  opacity: 0.5;
  user-select: none;
}

@media (max-width: 768px) {
  .flow-breadcrumb {
    flex-wrap: wrap;
    width: auto;
  }
  .flow-step {
    padding: 10px 12px;
    min-height: 44px;
  }
}
</style>
