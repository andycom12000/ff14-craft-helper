<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CompanyCraftCategory, CompanyCraftSequence, PartSlot } from '@/services/local-data-source.types'
import { listCompanyCraftByCategory, getItemSync, itemsCacheVersion } from '@/services/local-data-source'
import { getTotalMaterials, useWorkshopProjectsStore } from '@/stores/workshop-projects'
import type { WorkshopProject } from '@/stores/workshop-projects'
import { CATEGORY_META, SLOT_LABEL } from '@/utils/company-craft-labels'
import ItemName from '@/components/common/ItemName.vue'
import { trackEvent } from '@/utils/analytics'
import { useIsMobile } from '@/composables/useMediaQuery'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [projectId: string]
}>()

const workshopStore = useWorkshopProjectsStore()
const projectName = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const step = ref<1 | 2 | 3>(1)
const category = ref<CompanyCraftCategory | null>(null)

const slots: PartSlot[] = ['bow', 'stern', 'hull', 'bridge']

const slotChoices = ref<Record<PartSlot, number | null>>({
  bow: null, stern: null, hull: null, bridge: null,
})

const slotOptions = computed(() => {
  void itemsCacheVersion.value  // reactivity: re-derive labels when items load
  if (!category.value || category.value === 'workshop') {
    return { bow: [], stern: [], hull: [], bridge: [] } as Record<PartSlot, CompanyCraftSequence[]>
  }
  const out: Record<PartSlot, CompanyCraftSequence[]> = { bow: [], stern: [], hull: [], bridge: [] }
  for (const slot of slots) {
    out[slot] = listCompanyCraftByCategory(category.value, slot)
  }
  return out
})

const workshopPickId = ref<number | null>(null)
const workshopFilter = ref('')

const workshopMatches = computed(() => {
  void itemsCacheVersion.value  // reactivity: re-derive labels when items load
  if (category.value !== 'workshop') return []
  const all = listCompanyCraftByCategory('workshop')
  const q = workshopFilter.value.trim().toLowerCase()
  if (!q) return all.slice(0, 40)
  return all.filter(s => {
    const name = getItemSync(s.resultItemId)?.name ?? ''
    return name.toLowerCase().includes(q)
  }).slice(0, 40)
})

const selectedSequences = computed<CompanyCraftSequence[]>(() => {
  if (category.value === 'workshop') {
    const id = workshopPickId.value
    if (id == null) return []
    const all = listCompanyCraftByCategory('workshop')
    const seq = all.find(s => s.id === id)
    return seq ? [seq] : []
  }
  const out: CompanyCraftSequence[] = []
  for (const slot of slots) {
    const id = slotChoices.value[slot]
    if (id == null) continue
    const all = slotOptions.value[slot] ?? []
    const seq = all.find(s => s.id === id)
    if (seq) out.push(seq)
  }
  return out
})

const estimate = computed(() => {
  const fakeProj = {
    id: '_preview',
    name: '_',
    category: category.value!,
    createdAt: 0,
    sequences: selectedSequences.value.map(s => ({ sequenceId: s.id })),
    phaseProgress: {},
  }
  const totals = getTotalMaterials(fakeProj as WorkshopProject, selectedSequences.value)
  const kinds = totals.size
  let totalPhases = 0
  for (const s of selectedSequences.value) totalPhases += s.phases.length
  return { kinds, totalPhases }
})

function getResultName(seq: CompanyCraftSequence): string {
  return getItemSync(seq.resultItemId)?.name ?? `#${seq.resultItemId}`
}

const canProceedFromStep2 = computed(() => selectedSequences.value.length > 0)

watch(selectedSequences, (seqs) => {
  if (projectName.value.trim()) return  // user already typed; don't overwrite
  if (seqs.length === 0) {
    projectName.value = ''
    return
  }
  const firstName = getResultName(seqs[0])
  const base = firstName.replace(/\s*(Bow|Stern|Hull|Bridge|船首|船尾|船身|船底)\s*$/i, '').trim()
  if (category.value === 'workshop') {
    projectName.value = firstName
  } else {
    projectName.value = base ? `${base}號` : firstName
  }
})

function createAndClose() {
  if (!category.value) return
  if (!projectName.value.trim()) return
  const id = workshopStore.createProject({
    name: projectName.value.trim(),
    category: category.value,
    sequences: selectedSequences.value.map(s => ({ sequenceId: s.id })),
  })
  trackEvent('workshop_project_create', {
    category: category.value!,
    sequence_count: selectedSequences.value.length,
    has_all_parts: category.value === 'workshop'
      ? true
      : selectedSequences.value.length === 4,
  })
  emit('created', id)
  visible.value = false
}

function reset() {
  step.value = 1
  category.value = null
  slotChoices.value = { bow: null, stern: null, hull: null, bridge: null }
  workshopPickId.value = null
  workshopFilter.value = ''
  projectName.value = ''
}

watch(visible, v => {
  if (v) reset()
})

const isMobile = useIsMobile()

const nameInputRef = ref<{ focus: () => void } | null>(null)

function onStepEnter() {
  if (step.value === 3) {
    nameInputRef.value?.focus?.()
  }
}

function pickCategory(c: CompanyCraftCategory) {
  category.value = c
  step.value = 2
}

function categoryStats(c: CompanyCraftCategory): string {
  void itemsCacheVersion.value
  if (c === 'workshop') {
    const all = listCompanyCraftByCategory('workshop')
    if (!all.length) return '資料載入中…'
    const avgPhases = Math.round(
      all.reduce((s, seq) => s + seq.phases.length, 0) / all.length,
    )
    return `${all.length} 種建材 · 平均 ~${avgPhases} 階段`
  }
  let totalSeqs = 0
  let totalPhases = 0
  for (const slot of slots) {
    const sqs = listCompanyCraftByCategory(c, slot)
    totalSeqs += sqs.length
    for (const s of sqs) totalPhases += s.phases.length
  }
  if (!totalSeqs) return '資料載入中…'
  const avgPhases = Math.round(totalPhases / totalSeqs)
  return `${totalSeqs} 件零件可選 · 每件平均 ~${avgPhases} 階段`
}
function nextStep() {
  if (step.value === 1 && category.value) step.value = 2
  else if (step.value === 2) step.value = 3
}
function prevStep() {
  if (step.value === 2) step.value = 1
  else if (step.value === 3) step.value = 2
}
</script>

<template>
  <el-dialog v-model="visible" :width="560" :show-close="false" align-center class="cc-dialog" :fullscreen="isMobile">
    <template #header>
      <div class="head">
        <h4>{{ step === 1 ? '新增專案' : step === 2 ? '配置零件' : '命名專案' }}</h4>
        <span class="step-counter" :aria-label="`Step ${step} of 3`">
          <span class="step-dots" aria-hidden="true">
            <span
              class="step-dot"
              :class="{ done: step > 1, current: step === 1 }"
            />
            <span
              class="step-dot"
              :class="{ done: step > 2, current: step === 2 }"
            />
            <span
              class="step-dot"
              :class="{ current: step === 3 }"
            />
          </span>
          <span class="step-label">{{ step }} / 3</span>
        </span>
      </div>
    </template>

    <Transition name="step-slide" mode="out-in" @after-enter="onStepEnter">
    <div v-if="step === 1" key="s1" class="step1">
      <h5>做什麼？</h5>
      <div class="type-list">
        <button
          v-for="(meta, c) in CATEGORY_META"
          :key="c"
          class="type-row"
          :class="{ active: category === c }"
          @click="pickCategory(c as CompanyCraftCategory)"
        >
          <span class="row-icon">{{ meta.icon }}</span>
          <span class="row-body">
            <span class="row-name">{{ meta.label }}</span>
            <span class="row-meta">{{ categoryStats(c as CompanyCraftCategory) }}</span>
          </span>
          <span class="row-chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </div>

    <div v-else-if="step === 2" key="s2" class="step2">
      <template v-if="category !== 'workshop'">
        <h5>選擇 4 個零件（可留空槽）</h5>
        <div v-for="slot in slots" :key="slot" class="slot-row">
          <span class="slot-label">{{ SLOT_LABEL[slot] }}</span>
          <el-select
            v-model="slotChoices[slot]"
            clearable
            placeholder="— 選擇 —"
            class="slot-select"
          >
            <el-option
              v-for="seq in slotOptions[slot]"
              :key="seq.id"
              :value="seq.id"
              :label="getResultName(seq)"
            />
          </el-select>
        </div>
      </template>

      <template v-else>
        <h5>選擇建材</h5>
        <el-input
          v-model="workshopFilter"
          placeholder="搜尋建材名…"
          class="ws-search"
          clearable
        />
        <div v-if="workshopMatches.length === 0 && workshopFilter.trim()" class="ws-empty">
          沒有符合「{{ workshopFilter.trim() }}」的建材。
        </div>
        <div v-else class="ws-list">
          <button
            v-for="seq in workshopMatches"
            :key="seq.id"
            class="ws-item"
            :class="{ active: workshopPickId === seq.id }"
            @click="workshopPickId = seq.id"
          >
            <ItemName :item-id="seq.resultItemId" :fallback="`#${seq.resultItemId}`" />
          </button>
        </div>
      </template>

      <div class="preview" v-if="estimate.kinds > 0">
        <span class="preview-eyebrow">預估</span>
        <span class="preview-line">
          總素材 <strong>{{ estimate.kinds }}</strong> 種<span class="preview-sep">,</span>
          Phase <strong>{{ estimate.totalPhases }}</strong> 個
        </span>
      </div>
    </div>
    <div v-else key="s3" class="step3">
      <h5>專案名稱</h5>
      <el-input
        ref="nameInputRef"
        v-model="projectName"
        placeholder="輸入專案名稱…"
        @keyup.enter="projectName.trim() && createAndClose()"
      />
      <p class="hint">↑ 已自動填入，可修改</p>
      <div class="preview">
        <span class="preview-eyebrow">預估</span>
        <span class="preview-line">
          總素材 <strong>{{ estimate.kinds }}</strong> 種<span class="preview-sep">·</span>
          Phase 總數 <strong>{{ estimate.totalPhases }}</strong>
        </span>
      </div>
    </div>
    </Transition>

    <template #footer>
      <div class="footer">
        <el-button v-if="step === 1" @click="visible = false">取消</el-button>
        <el-button v-else @click="prevStep">← 上一步</el-button>
        <el-button
          v-if="step !== 1"
          type="primary"
          :disabled="
            (step === 2 && !canProceedFromStep2) ||
            (step === 3 && !projectName.trim())
          "
          @click="step === 3 ? createAndClose() : nextStep()"
        >
          {{ step === 3 ? '建立並開始 →' : '下一步 →' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; }
.head h4 {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 20px;
}
.step-counter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.step-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 32%, transparent);
  background: transparent;
  transition: all 0.18s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.step-dot.done {
  background: var(--app-craft, oklch(0.50 0.16 40));
  border-color: var(--app-craft, oklch(0.50 0.16 40));
}
.step-dot.current {
  width: 18px;
  border-radius: 999px;
  background: var(--app-craft, oklch(0.50 0.16 40));
  border-color: var(--app-craft, oklch(0.50 0.16 40));
}
.step-label {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--app-text-muted);
}
.step1 h5 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  margin: 0 0 12px;
}
.type-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--app-border);
}
.type-row {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px 6px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background-color 0.12s var(--ease-out-quart);
  width: 100%;
}
.type-row:hover {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 4%, transparent);
}
.type-row.active {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 8%, transparent);
}
.type-row:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: -1px;
}
.row-icon {
  font-size: 22px;
  line-height: 1;
  text-align: center;
}
.row-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.row-name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
}
.row-meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-text-muted);
}
.row-chevron {
  font-size: 18px;
  color: var(--app-text-muted);
  opacity: 0.45;
  transition: opacity 0.12s, color 0.12s;
}
.type-row.active .row-chevron {
  opacity: 1;
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.footer { display: flex; justify-content: space-between; }

/* Step 2 — slot picker */
.step2 h5 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  margin: 0 0 16px;
}
.slot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.slot-label {
  width: 40px;
  flex-shrink: 0;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: var(--app-text-muted);
  text-align: right;
}
.slot-select { flex: 1; }

/* Step 2 — workshop picker */
.ws-search { margin-bottom: 10px; }
.ws-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.ws-item {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 6px 12px;
  background: var(--app-surface);
  cursor: pointer;
  font-size: 13px;
  color: inherit;
  transition: all 0.12s;
}
.ws-item:hover {
  background: var(--app-surface-hover);
  border-color: var(--app-accent);
}
.ws-item.active {
  background: var(--app-accent-glow);
  border-color: var(--app-accent);
  border-width: 2px;
}

/* Workshop empty state */
.ws-empty {
  padding: 16px 4px;
  font-size: 13px;
  color: var(--app-text-muted);
  text-align: center;
  font-style: italic;
}

/* Preview strip — editorial line, no box */
.preview {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px dashed var(--app-border);
  display: flex;
  align-items: baseline;
  gap: 14px;
  font-size: 13px;
  color: var(--app-text-muted);
}
.preview-eyebrow {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  opacity: 0.7;
  flex-shrink: 0;
}
.preview-line strong {
  font-family: 'Fira Code', monospace;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: 0.02em;
}
.preview-sep {
  display: inline-block;
  margin: 0 6px;
  opacity: 0.5;
}

/* Step 3 — naming */
.step3 h5 { margin: 0 0 8px; font-family: 'Noto Serif TC', serif; font-weight: 600; font-size: 15px; }
.hint {
  font-size: 11px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', monospace;
  letter-spacing: 0.04em;
  margin: 6px 0 0;
}

@media (max-width: 640px) {
  .row-icon { font-size: 20px; }
  .row-name { font-size: 14px; }
}

/* Step slide transition */
.step-slide-enter-from {
  transform: translateX(16px);
  opacity: 0;
}
.step-slide-leave-to {
  transform: translateX(-16px);
  opacity: 0;
}
.step-slide-enter-active,
.step-slide-leave-active {
  transition: transform 0.22s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
              opacity 0.22s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
@media (prefers-reduced-motion: reduce) {
  .step-slide-enter-active,
  .step-slide-leave-active {
    transition: opacity 0.12s ease;
  }
  .step-slide-enter-from,
  .step-slide-leave-to {
    transform: none;
  }
}
</style>
