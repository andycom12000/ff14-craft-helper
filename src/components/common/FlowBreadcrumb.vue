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
  /** When true, the active step renders a transient/loading state (spinner ring, advanced rail). */
  pending?: boolean
  /** Label override shown in the mobile active-label area while pending. */
  pendingLabel?: string
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

const activeLabel = computed(() => {
  if (props.pending && props.pendingLabel) return props.pendingLabel
  const idx = Math.min(Math.max(currentIndex.value, 0), props.steps.length - 1)
  return props.steps[idx]?.label ?? ''
})

const progressPercent = computed(() => {
  if (props.steps.length <= 1) return 0
  const clamped = Math.min(Math.max(currentIndex.value, 0), props.steps.length - 1)
  // While pending, advance the rail halfway toward the next step to hint progress
  const advance = props.pending && clamped < props.steps.length - 1 ? 0.5 : 0
  return ((clamped + advance) / (props.steps.length - 1)) * 100
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
    <!-- Desktop: full chips with labels -->
    <div class="flow-chips">
      <template v-for="(step, i) in steps" :key="`chip-${i}`">
        <button
          class="flow-step"
          :class="{
            active: i === currentIndex,
            done: i < currentIndex,
            future: i > currentIndex,
            pending: pending && i === currentIndex,
          }"
          @click="handleClick(i, step)"
        >
          <span class="flow-icon" aria-hidden="true">
            <span v-if="pending && i === currentIndex" class="flow-spinner" />
            <template v-else-if="i < currentIndex">✓</template>
            <template v-else>{{ step.icon }}</template>
          </span>
          <span class="flow-label">{{ step.label }}</span>
        </button>
        <span v-if="i < steps.length - 1" class="flow-arrow" aria-hidden="true">›</span>
      </template>
    </div>

    <!-- Mobile: compact progress track with numbered dots + active label -->
    <div class="flow-track">
      <div class="flow-track-rail" aria-hidden="true">
        <div class="flow-track-fill" :style="{ '--progress': progressPercent / 100 }" />
      </div>
      <div class="flow-track-dots">
        <button
          v-for="(step, i) in steps"
          :key="`dot-${i}`"
          type="button"
          class="flow-dot"
          :class="{
            'flow-dot--active': i === currentIndex,
            'flow-dot--done': i < currentIndex,
            'flow-dot--future': i > currentIndex,
            'flow-dot--pending': pending && i === currentIndex,
          }"
          :aria-label="`${step.label}（步驟 ${i + 1} / ${steps.length}）`"
          :aria-current="i === currentIndex ? 'step' : undefined"
          @click="handleClick(i, step)"
        >
          <span class="flow-dot-marker" aria-hidden="true">
            <template v-if="i < currentIndex">✓</template>
            <template v-else>{{ i + 1 }}</template>
          </span>
        </button>
      </div>
    </div>
    <div class="flow-active-label" aria-live="polite">
      <span class="flow-active-index">{{ Math.min(currentIndex + 1, steps.length) }} / {{ steps.length }}</span>
      <span class="flow-active-text">{{ activeLabel }}</span>
    </div>
  </nav>
</template>

<style scoped>
.flow-breadcrumb {
  margin-bottom: 20px;
}

/* ===== Desktop chips (default) ===== */
.flow-chips {
  display: flex;
  align-items: center;
  gap: 4px;
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
  background: var(--page-accent-dim);
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
  background: color-mix(in oklch, var(--app-text-muted) 10%, transparent);
  color: var(--app-text);
}

.flow-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.flow-label { font-size: 13px; }

/* Desktop chip spinner */
.flow-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: flow-spin 0.8s linear infinite;
}

@keyframes flow-spin {
  to { transform: rotate(360deg); }
}

.flow-arrow {
  color: var(--app-text-muted);
  font-size: 16px;
  opacity: 0.5;
  user-select: none;
}

/* Mobile-only elements hidden on desktop */
.flow-track,
.flow-active-label {
  display: none;
}

/* ===== Mobile: track + dots ===== */
@media (max-width: 640px) {
  .flow-breadcrumb {
    margin-bottom: 14px;
  }

  .flow-chips {
    display: none;
  }

  .flow-track {
    display: block;
    position: relative;
    padding: 14px 0 10px;
  }

  .flow-track-rail {
    position: absolute;
    left: calc(var(--touch-target-min, 44px) / 2);
    right: calc(var(--touch-target-min, 44px) / 2);
    top: calc(14px + var(--touch-target-min, 44px) / 2);
    height: 2px;
    background: var(--el-border-color-lighter);
    border-radius: 2px;
    transform: translateY(-50%);
    overflow: hidden;
  }

  .flow-track-fill {
    --progress: 0;
    height: 100%;
    width: 100%;
    background: var(--page-accent, var(--accent-gold));
    transform: scaleX(var(--progress));
    transform-origin: left center;
    transition: transform 0.3s var(--ease-out-quart, ease-out);
  }

  .flow-track-dots {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .flow-dot {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min, 44px);
    height: var(--touch-target-min, 44px);
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .flow-dot-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--app-surface);
    border: 2px solid var(--el-border-color);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    transition:
      background 0.2s var(--ease-out-quart, ease-out),
      border-color 0.2s var(--ease-out-quart, ease-out),
      color 0.2s var(--ease-out-quart, ease-out),
      transform 0.2s var(--ease-out-quart, ease-out);
  }

  .flow-dot--done .flow-dot-marker {
    background: var(--app-success);
    border-color: var(--app-success);
    color: var(--el-bg-color);
  }

  .flow-dot--active .flow-dot-marker {
    background: var(--page-accent, var(--accent-gold));
    border-color: var(--page-accent, var(--accent-gold));
    color: var(--el-bg-color);
    transform: scale(1.1);
    box-shadow: 0 0 0 4px var(--page-accent-dim);
  }

  /* Pending: rotating conic-gradient ring around the active dot */
  .flow-dot--pending {
    position: relative;
  }

  .flow-dot--pending::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 36px;
    height: 36px;
    margin: -18px 0 0 -18px;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      var(--page-accent, var(--accent-gold)) 0deg,
      transparent 240deg,
      transparent 360deg
    );
    -webkit-mask: radial-gradient(circle, transparent 14px, #000 14px, #000 18px, transparent 18px);
            mask: radial-gradient(circle, transparent 14px, #000 14px, #000 18px, transparent 18px);
    animation: flow-spin 1.1s linear infinite;
    pointer-events: none;
  }

  .flow-dot--pending .flow-dot-marker {
    /* Soften the box-shadow halo so the spinning ring reads cleanly */
    box-shadow: none;
  }

  .flow-dot--future .flow-dot-marker {
    background: var(--app-surface);
  }

  .flow-dot:focus-visible .flow-dot-marker {
    outline: 2px solid var(--page-accent, var(--accent-gold));
    outline-offset: 3px;
  }

  .flow-active-label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 2px 4px 0;
  }

  .flow-active-index {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    letter-spacing: 0.05em;
  }

  .flow-active-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--page-accent, var(--app-accent-light));
  }
}
</style>
