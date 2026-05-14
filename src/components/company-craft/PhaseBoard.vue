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

const boardRef = ref<HTMLElement | null>(null)

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
    const target = boardRef.value?.querySelector(
      `.part-group[data-seq="${seqId}"] .phase-row:not(.done)`
    )
    ;(target as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}
</script>

<template>
  <div class="phase-board" ref="boardRef">
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
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}
.part-group + .part-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--app-border);
}
.part-group-head {
  width: 100%;
  background: transparent;
  padding: 8px 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  border: 0;
  border-radius: 6px;
  text-align: left;
  color: inherit;
  transition: background-color 0.12s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.part-group-head:hover {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 5%, transparent);
}
.part-group-head:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.head-title { display: inline-flex; align-items: center; gap: 10px; }
.caret {
  font-size: 9px;
  color: var(--app-text-muted);
  display: inline-block;
  width: 12px;
  text-align: center;
}
.slot {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--app-craft);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 30%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
  text-transform: uppercase;
}
.part-group-head .meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.part-group-body {
  padding: 4px 0 4px 22px;
}
.part-group-body > * + * { border-top: 1px dashed var(--app-border); }
</style>
