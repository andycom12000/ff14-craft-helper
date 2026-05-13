<script setup lang="ts">
import { computed } from 'vue'
import type { CompanyCraftPhase } from '@/services/local-data-source.types'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  isPhaseComplete,
} from '@/stores/workshop-projects'
import ItemName from '@/components/common/ItemName.vue'
import SupplyItemCounter from './SupplyItemCounter.vue'

const props = defineProps<{
  projectId: string
  sequenceId: number
  phase: CompanyCraftPhase
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

function markAllDelivered() {
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    store.setDelivered(props.projectId, phaseKey.value, i, props.phase.supplyItems[i].amount)
  }
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
      <div class="fill" :style="{ width: progressPct + '%' }" />
    </div>

    <div v-if="!complete" class="supplies">
      <div
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
      </div>
    </div>

    <div v-if="!complete" class="actions">
      <el-button size="small" text @click="markAllDelivered">全部繳清</el-button>
    </div>
  </div>
</template>

<style scoped>
.phase-row {
  padding: 10px 16px;
}
.phase-row.active { background: var(--app-accent-glow); }
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
  border: 2px solid var(--app-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: transparent;
}
.status.done {
  background: var(--app-success-tint);
  border-color: var(--app-success);
  color: var(--app-success);
}
.status.active {
  background: var(--app-accent-glow);
  border-color: var(--app-accent);
  color: var(--app-accent);
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
  background: var(--app-surface-2);
  border-radius: 999px;
  overflow: hidden;
}
.mini-progress .fill {
  height: 100%;
  background: var(--app-accent);
  transition: width 0.2s var(--ease-out-quart);
}
.supplies {
  margin: 10px 0 4px 116px;
  padding: 12px 14px;
  background: var(--app-surface-2);
  border-radius: 8px;
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
.actions { margin: 8px 0 4px 116px; }

@media (max-width: 640px) {
  .head { grid-template-columns: 22px 80px 1fr; }
  .head .progress { grid-column: 1 / -1; margin-left: 116px; }
  .supplies, .mini-progress, .actions { margin-left: 0; }
}
</style>
