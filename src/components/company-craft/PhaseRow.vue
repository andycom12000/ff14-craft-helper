<script setup lang="ts">
import { computed, h } from 'vue'
import { ElMessage } from 'element-plus'
import type { CompanyCraftPhase } from '@/services/local-data-source.types'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  isPhaseComplete,
} from '@/stores/workshop-projects'
import ItemName from '@/components/common/ItemName.vue'
import SupplyItemCounter from './SupplyItemCounter.vue'
import { trackEvent } from '@/utils/analytics'

const props = defineProps<{
  projectId: string
  sequenceId: number
  phase: CompanyCraftPhase
}>()

const emit = defineEmits<{
  'mark-next': []
}>()

const store = useWorkshopProjectsStore()

const phaseKey = computed(() => serializePhaseKey({
  sequenceId: props.sequenceId,
  partIndex: props.phase.partIndex,
  processIndex: props.phase.processIndex,
}))

const project = computed(() => store.getProject(props.projectId))

const complete = computed(() =>
  project.value ? isPhaseComplete(project.value, props.phase, phaseKey.value) : false,
)

const deliveredCount = computed(() => {
  if (!project.value) return 0
  let n = 0
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    n += store.getDelivered(props.projectId, phaseKey.value, i)
  }
  return n
})

const totalCount = computed(() =>
  props.phase.supplyItems.reduce((sum, s) => sum + s.amount, 0),
)

const progressPct = computed(() =>
  totalCount.value === 0 ? 0 : Math.round((deliveredCount.value / totalCount.value) * 100),
)

const started = computed(() => deliveredCount.value > 0)

function markPhaseAndAdvance() {
  const prev: number[] = []
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    prev.push(store.getDelivered(props.projectId, phaseKey.value, i))
    store.setDelivered(props.projectId, phaseKey.value, i, props.phase.supplyItems[i].amount)
  }
  trackEvent('workshop_project_phase_completed', {
    project_id: props.projectId,
    sequence_id: props.sequenceId,
    phase_index: props.phase.partIndex * 10 + props.phase.processIndex,
  })
  emit('mark-next')

  const msg = ElMessage({
    type: 'success',
    duration: 8000,
    showClose: true,
    message: h('span', { style: 'display: inline-flex; align-items: center; gap: 10px;' }, [
      h('span', '此階段已標記完成'),
      h('button', {
        style: 'background: transparent; border: 0; color: var(--app-craft, oklch(0.50 0.16 40)); font-weight: 600; cursor: pointer; padding: 0 4px; font-size: inherit; font-family: inherit; text-decoration: underline;',
        onClick: () => {
          for (let i = 0; i < prev.length; i++) {
            store.setDelivered(props.projectId, phaseKey.value, i, prev[i])
          }
          msg.close()
        },
      }, '復原'),
    ]),
  })
}
</script>

<template>
  <div class="phase-row" :class="{ active: started && !complete, done: complete }">
    <div class="head">
      <span class="status" :class="{ done: complete, active: started && !complete }">
        <template v-if="complete">✓</template>
        <template v-else-if="started">●</template>
      </span>
      <span class="job-badge" :class="{ idle: !started && !complete }">
        {{ phase.jobAbbr }}{{ phase.level ? ' ' + phase.level : '' }}
      </span>
      <span class="name">Phase {{ phase.processIndex + 1 }}</span>
      <span class="progress">
        {{ complete ? '完成' : (started ? `進行中 ${progressPct}%` : '未開工') }}
      </span>
    </div>

    <div v-if="started && !complete" class="mini-progress">
      <div class="fill" :style="{ transform: `scaleX(${progressPct / 100})` }" />
    </div>

    <div v-if="!complete" class="supplies">
      <label
        v-for="(supply, i) in phase.supplyItems"
        :key="i"
        class="supply"
      >
        <span class="supply-name">
          <ItemName :item-id="supply.itemId" :fallback="`#${supply.itemId}`" />
        </span>
        <SupplyItemCounter
          :project-id="projectId"
          :phase-key="phaseKey"
          :supply-index="i"
          :max="supply.amount"
        />
      </label>
    </div>

    <div v-if="!complete" class="actions">
      <el-button size="small" class="phase-cta" @click="markPhaseAndAdvance">
        完成此階段 →
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.phase-row {
  padding: 10px 4px 12px;
}
.phase-row.active {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 5%, transparent);
  border-radius: 6px;
}
.phase-row.done .status { color: var(--app-success); }

.head {
  display: grid;
  grid-template-columns: 22px 80px 1fr auto;
  gap: 12px;
  align-items: center;
}
.status {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px dashed var(--app-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: transparent;
}
.status.done {
  background: var(--app-success-tint);
  border-color: var(--app-success);
  border-style: solid;
  color: var(--app-success);
}
.status.active {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 12%, transparent);
  border-color: var(--app-craft, oklch(0.50 0.16 40));
  border-style: solid;
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.job-badge {
  display: inline-block;
  padding: 2px 7px;
  background: var(--app-craft);
  color: var(--app-surface);
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-align: center;
}
.job-badge.idle { background: var(--app-text-muted); }
.name { font-size: 14px; }
.progress {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.mini-progress {
  height: 4px;
  margin: 10px 0 12px 116px;
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 10%, transparent);
  border-radius: 999px;
  overflow: hidden;
}
.mini-progress .fill {
  height: 100%;
  width: 100%;
  background: var(--app-craft, oklch(0.50 0.16 40));
  transform-origin: left center;
  transition: transform 0.2s var(--ease-out-quart);
  will-change: transform;
}
.supplies {
  margin: 8px 0 4px 116px;
  padding: 4px 0 4px 14px;
  border-left: 1px solid var(--app-border);
}
.supply {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px dashed var(--app-border);
}
.supply:last-child { border-bottom: 0; }
.supply-name { font-size: 13px; }
.actions {
  margin: 10px 0 4px 116px;
  display: flex;
  gap: 4px;
}
.actions :deep(.phase-cta) {
  background: transparent;
  color: var(--app-craft, oklch(0.50 0.16 40));
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 38%, transparent);
  font-weight: 500;
}
.actions :deep(.phase-cta:hover) {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 60%, transparent);
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.actions :deep(.phase-cta:focus-visible) {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .head { grid-template-columns: 22px 80px 1fr; }
  .head .progress { grid-column: 1 / -1; margin-left: 116px; }
  .supplies, .mini-progress, .actions { margin-left: 0; }
}
</style>
