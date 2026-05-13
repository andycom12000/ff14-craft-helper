<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import { getProjectProgress, getRemainingMaterials } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { useBomStore } from '@/stores/bom'
import { CATEGORY_META } from '@/utils/company-craft-labels'
import PhaseBoard from './PhaseBoard.vue'

const props = defineProps<{
  project: WorkshopProject
  sequences: CompanyCraftSequence[]
  seqById?: Map<number, CompanyCraftSequence>
  expanded?: boolean
}>()

const emit = defineEmits<{
  expand: [projectId: string]
  sync: [projectId: string]
}>()

const bom = useBomStore()

const seqByIdLocal = computed(
  () => props.seqById ?? new Map(props.sequences.map(s => [s.id, s])),
)

const progress = computed(() =>
  getProjectProgress(props.project, props.sequences, seqByIdLocal.value),
)
const progressPct = computed(() => Math.round(progress.value * 100))

const totalPhases = computed(() => {
  let n = 0
  for (const r of props.project.sequences) {
    const seq = seqByIdLocal.value.get(r.sequenceId)
    if (seq) n += seq.phases.length
  }
  return n
})

const donePhases = computed(() => Math.round(progress.value * totalPhases.value))

const remainingCount = computed(() => {
  const m = getRemainingMaterials(props.project, props.sequences, seqByIdLocal.value)
  return m.size
})

const isLinkedToBom = computed(() =>
  bom.targets.some(t => t.kind === 'company-craft-project' && t.projectId === props.project.id),
)

const meta = computed(() => CATEGORY_META[props.project.category])

const partsLabel = computed(() => {
  const n = props.project.sequences.length
  return props.project.category === 'workshop' ? `${n} 件` : `${n} 零件`
})
</script>

<template>
  <article class="card">
    <header class="card-head">
      <div class="card-icon">{{ meta.icon }}</div>
      <div class="card-title-block">
        <h3 class="card-title">{{ project.name }}</h3>
        <div class="card-sub">{{ meta.label }} · {{ partsLabel }} · {{ donePhases }}/{{ totalPhases }} 階段完成</div>
      </div>
      <div class="card-actions">
        <el-button text @click="emit('expand', project.id)">
          {{ expanded ? '收合' : '展開' }}
        </el-button>
        <el-button type="primary" @click="emit('sync', project.id)">
          {{ isLinkedToBom ? '前往購物清單 →' : '加入購物清單' }}
        </el-button>
      </div>
    </header>
    <div class="card-progress">
      <div class="bar"><div class="fill" :style="{ width: progressPct + '%' }" /></div>
      <span class="meta">
        {{ progressPct }}% · 剩 {{ remainingCount }} 種素材
        <span v-if="isLinkedToBom" class="linked"> · 已關聯 BOM</span>
      </span>
    </div>
    <PhaseBoard
      v-if="expanded"
      :project="project"
      :sequences="sequences"
      :seq-by-id="seqById"
    />
  </article>
</template>

<style scoped>
.card {
  background: var(--app-surface-2);
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 18%, transparent);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  transition: box-shadow 0.15s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
              border-color 0.15s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}

.card:hover {
  border-color: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 38%, transparent);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 10%, transparent);
}

/* ── Card Header ─────────────────────────────────────────────────────────── */
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.card-icon {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.card-title-block {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-sub {
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1.4;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Progress Bar ─────────────────────────────────────────────────────────── */
.card-progress {
  margin-top: 14px;
}

.bar {
  height: 6px;
  background: var(--app-craft-dim, oklch(0.50 0.16 40 / 0.10));
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 6px;
}

.fill {
  height: 100%;
  background: var(--app-craft, oklch(0.50 0.16 40));
  border-radius: 999px;
  transition: width 0.4s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}

.meta {
  font-size: 12px;
  color: var(--app-text-muted);
}

.linked {
  color: var(--app-success, oklch(0.55 0.16 145));
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .card-head {
    flex-wrap: wrap;
  }

  .card-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
