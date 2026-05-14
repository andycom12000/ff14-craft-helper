<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CompanyCraftPhase } from '@/services/local-data-source.types'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  isPhaseComplete,
} from '@/stores/workshop-projects'
import { getItemSync, itemsCacheVersion } from '@/services/local-data-source'
import { useLocaleStore } from '@/stores/locale'
import { getIconUrl } from '@/utils/icon-url'
import ItemName from '@/components/common/ItemName.vue'
import SupplyItemCounter from './SupplyItemCounter.vue'
import { trackEvent } from '@/utils/analytics'
import { getJobNameShort } from '@/utils/jobs'

const props = defineProps<{
  projectId: string
  sequenceId: number
  phase: CompanyCraftPhase
}>()

const emit = defineEmits<{
  'mark-next': []
}>()

const store = useWorkshopProjectsStore()
const localeStore = useLocaleStore()

const jobLine = computed(() => {
  const job = getJobNameShort(props.phase.jobAbbr)
  return props.phase.level ? `${job} Lv.${props.phase.level}` : job
})

const supplyIconUrls = computed(() => {
  void itemsCacheVersion.value
  const locale = localeStore.current
  return props.phase.supplyItems.map(s => {
    const item = getItemSync(s.itemId, locale)
    return item?.iconId ? getIconUrl(item.iconId) : ''
  })
})

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

const expandedComplete = ref(false)
watch(complete, (isComplete) => {
  if (!isComplete) expandedComplete.value = false
})

function resetPhase() {
  for (let i = 0; i < props.phase.supplyItems.length; i++) {
    store.setDelivered(props.projectId, phaseKey.value, i, 0)
  }
  expandedComplete.value = false
}

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
    <component
      :is="complete ? 'button' : 'div'"
      :type="complete ? 'button' : undefined"
      class="head"
      :class="{ 'head-clickable': complete }"
      :aria-expanded="complete ? expandedComplete : undefined"
      @click="complete && (expandedComplete = !expandedComplete)"
    >
      <span
        class="status"
        :class="{ done: complete, active: started && !complete }"
        aria-hidden="true"
      />
      <span class="name">
        <span v-if="complete" class="head-caret" aria-hidden="true">{{ expandedComplete ? '▾' : '▸' }}</span>
        Phase {{ phase.processIndex + 1 }}
        <span class="phase-meta">· {{ jobLine }}</span>
      </span>
      <span class="progress">
        <template v-if="complete">完成</template>
        <template v-else-if="started">進行中 <span class="progress-num">{{ progressPct }}%</span></template>
        <template v-else>未開工</template>
      </span>
    </component>

    <div v-if="!complete || expandedComplete" class="supplies">
      <label
        v-for="(supply, i) in phase.supplyItems"
        :key="i"
        class="supply"
      >
        <span class="supply-name">
          <img
            v-if="supplyIconUrls[i]"
            :src="supplyIconUrls[i]"
            class="supply-icon"
            alt=""
            width="20"
            height="20"
            loading="lazy"
          />
          <span v-else class="supply-icon supply-icon-placeholder" aria-hidden="true" />
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
    <div v-else-if="expandedComplete" class="actions">
      <el-button size="small" class="reset-cta" @click="resetPhase">
        ↻ 重設此階段
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* Resting list row — flat, no card chrome (no bg, no radius).
 * The status dot's color carries the "active" signal; the supplies
 * grid below is the row's own progress display. No nested cards. */
.phase-row {
  padding: 10px 4px 12px;
}

.head {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  text-align: left;
  color: inherit;
}
.head-clickable {
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.12s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.head-clickable:hover {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 4%, transparent);
}
.head-clickable:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.head-caret {
  display: inline-block;
  width: 14px;
  font-size: 11px;
  color: var(--app-text-muted);
  margin-right: 4px;
}

/* Single-shape 8px dot. Only the color changes between idle / active /
 * done — no shape juggle, no inner glyph, no dashed border. */
.status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text-muted) 35%, transparent);
  justify-self: center;
  transition: background-color 0.15s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.status.active { background: var(--app-craft, oklch(0.50 0.16 40)); }
.status.done { background: var(--app-success, oklch(0.55 0.16 145)); }

.name {
  font-size: 14px;
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
/* Inline job metadata — Noto Sans muted, no chip, no Fira Code on CJK. */
.phase-meta {
  color: var(--app-text-muted);
  font-weight: 400;
  font-size: 13px;
}

.progress {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 12px;
  color: var(--app-text-muted);
}
/* Only the numeric part uses Fira Code (Four-Track Rule). */
.progress-num {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: 0.02em;
  margin-left: 2px;
}

/* Supplies indent matches the dot column (14 + 12 gap = 26px), so the
 * supplies grid lines up under the phase name — not buried 116px in. */
.supplies {
  margin: 8px 0 4px 26px;
  padding: 4px 0 4px 14px;
  border-left: 1px solid var(--app-border);
}
.supply {
  display: grid;
  grid-template-columns: 1fr 200px;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--app-border);
}
.supply:last-child { border-bottom: 0; }
.supply-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  min-width: 0;
}
.supply-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 6%, transparent);
  object-fit: cover;
}
.supply-icon-placeholder {
  border: 1px dashed var(--app-border);
  background: transparent;
}

@media (max-width: 640px) {
  .supply {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
.actions {
  margin: 10px 0 4px 26px;
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
.actions :deep(.reset-cta) {
  background: transparent;
  color: var(--app-text-muted);
  border: 1px solid var(--app-border);
  font-weight: 500;
}
.actions :deep(.reset-cta:hover) {
  color: var(--app-danger);
  border-color: color-mix(in srgb, var(--app-danger) 40%, transparent);
  background: color-mix(in srgb, var(--app-danger) 5%, transparent);
}


@media (max-width: 640px) {
  .head { grid-template-columns: 14px 1fr auto; }
  .name { font-size: 13px; }
  .supplies, .actions { margin-left: 14px; }
}
</style>
