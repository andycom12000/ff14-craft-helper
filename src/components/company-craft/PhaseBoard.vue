<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import ItemName from '@/components/common/ItemName.vue'
import { SLOT_LABEL } from '@/utils/company-craft-labels'
import PhaseRow from './PhaseRow.vue'

const props = defineProps<{
  project: WorkshopProject
  sequences: CompanyCraftSequence[]
  seqById?: Map<number, CompanyCraftSequence>
}>()

const seqByIdLocal = computed(
  () => props.seqById ?? new Map(props.sequences.map(s => [s.id, s])),
)

const linkedSequences = computed(() =>
  props.project.sequences
    .map(r => ({ ref: r, seq: seqByIdLocal.value.get(r.sequenceId) }))
    .filter((x): x is { ref: typeof x.ref; seq: CompanyCraftSequence } => !!x.seq),
)

const expandedParts = ref<Set<number>>(new Set())

function togglePart(seqId: number) {
  const next = new Set(expandedParts.value)
  next.has(seqId) ? next.delete(seqId) : next.add(seqId)
  expandedParts.value = next
}

function isPartExpanded(seqId: number) {
  return expandedParts.value.has(seqId)
}

function onMarkNext(seqId: number) {
  nextTick(() => {
    const rows = document.querySelectorAll(`.part-group[data-seq="${seqId}"] .phase-row:not(.done)`)
    if (rows.length > 0) (rows[0] as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}
</script>

<template>
  <div class="phase-board">
    <div
      v-for="{ seq } in linkedSequences"
      :key="seq.id"
      class="part-group"
      :data-seq="seq.id"
    >
      <button
        class="part-group-head"
        :aria-expanded="isPartExpanded(seq.id)"
        @click="togglePart(seq.id)"
      >
        <span class="head-title">
          <span class="caret">{{ isPartExpanded(seq.id) ? '▼' : '▶' }}</span>
          <span v-if="seq.partSlot" class="slot">{{ SLOT_LABEL[seq.partSlot] }}</span>
          <ItemName :item-id="seq.resultItemId" :fallback="`#${seq.resultItemId}`" />
        </span>
        <span class="meta">{{ seq.phases.length }} 階段</span>
      </button>

      <div v-if="isPartExpanded(seq.id)" class="part-group-body">
        <PhaseRow
          v-for="(phase, idx) in seq.phases"
          :key="idx"
          :project-id="project.id"
          :sequence-id="seq.id"
          :phase="phase"
          @mark-next="onMarkNext(seq.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.phase-board {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--app-border);
}
.part-group {
  margin-bottom: 18px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--app-surface);
}
.part-group-head {
  width: 100%;
  background: var(--app-surface-2);
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  border: 0;
  text-align: left;
  color: inherit;
}
.head-title { display: inline-flex; align-items: center; gap: 8px; }
.caret { font-size: 10px; color: var(--app-text-muted); }
.slot {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--app-craft);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  padding: 2px 8px;
}
.part-group-head .meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.part-group-body > * + * { border-top: 1px solid var(--app-border); }
</style>
