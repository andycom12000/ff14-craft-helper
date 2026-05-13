<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import { getProjectProgressDetail, getRemainingMaterials } from '@/stores/workshop-projects'
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
  delete: [projectId: string]
  reopen: [projectId: string]
}>()

const bom = useBomStore()

const seqByIdLocal = computed(
  () => props.seqById ?? new Map(props.sequences.map(s => [s.id, s])),
)

const detail = computed(() =>
  getProjectProgressDetail(props.project, props.sequences, seqByIdLocal.value),
)
const progressPct = computed(() => Math.round(detail.value.ratio * 100))
const donePhases = computed(() => detail.value.done)
const totalPhases = computed(() => detail.value.total)

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

const isCompleted = computed(() => !!props.project.completedAt)

const completedAtLabel = computed(() => {
  const ts = props.project.completedAt
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
</script>

<template>
  <article class="card" :class="{ 'card-completed': isCompleted }">
    <header class="card-head">
      <div class="card-icon">{{ meta.icon }}</div>
      <button
        type="button"
        class="card-title-block"
        :aria-expanded="!!expanded"
        @click="emit('expand', project.id)"
      >
        <h3 class="card-title">
          <span class="title-caret" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
          {{ project.name }}
          <span v-if="isCompleted" class="completed-pill">✓ 已完成</span>
        </h3>
        <div class="card-sub">
          {{ meta.label }} · {{ partsLabel }}
          <template v-if="isCompleted"> · 完成於 {{ completedAtLabel }}</template>
        </div>
      </button>
      <div class="card-actions">
        <el-dropdown trigger="click">
          <el-button text class="kebab">⋯</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isCompleted" @click="emit('reopen', project.id)">重新開啟</el-dropdown-item>
              <el-dropdown-item @click="emit('delete', project.id)">刪除專案</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button text @click="emit('expand', project.id)">
          {{ expanded ? '收合' : '展開' }}
        </el-button>
        <el-button v-if="!isCompleted" class="craft-cta" @click="emit('sync', project.id)">
          {{ isLinkedToBom ? '前往購物清單 →' : '加入購物清單' }}
        </el-button>
      </div>
    </header>
    <div class="card-progress">
      <div class="bar"><div class="fill" :style="{ transform: `scaleX(${detail.ratio})` }" /></div>
      <span class="meta">
        {{ progressPct }}% · {{ donePhases }}/{{ totalPhases }} 階段 · 剩 {{ remainingCount }} 種素材
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

.card-completed {
  border-color: color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 30%, transparent);
}
.card-completed:hover {
  border-color: color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 50%, transparent);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 12%, transparent);
}
.card-completed .fill {
  background: var(--app-success, oklch(0.55 0.16 145));
}

.completed-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  margin-left: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 30%, transparent);
  color: var(--app-success, oklch(0.55 0.16 145));
  font-family: 'Fira Code', monospace;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.05em;
  line-height: 1.4;
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
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
  border-radius: 6px;
  transition: background-color 0.12s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.card-title-block:hover {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 4%, transparent);
}
.card-title-block:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.title-caret {
  display: inline-block;
  width: 12px;
  font-size: 12px;
  color: var(--app-text-muted);
  flex-shrink: 0;
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

.kebab {
  padding: 0 8px;
}

.card-actions :deep(.craft-cta) {
  background: transparent;
  color: var(--app-craft, oklch(0.50 0.16 40));
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 38%, transparent);
  font-weight: 500;
}
.card-actions :deep(.craft-cta:hover) {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 60%, transparent);
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.card-actions :deep(.craft-cta:active) {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 14%, transparent);
}
.card-actions :deep(.craft-cta:focus-visible) {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
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
  width: 100%;
  background: var(--app-craft, oklch(0.50 0.16 40));
  border-radius: 999px;
  transform-origin: left center;
  transition: transform 0.4s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
  will-change: transform;
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
