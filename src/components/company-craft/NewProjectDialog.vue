<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CompanyCraftCategory, CompanyCraftSequence, PartSlot } from '@/services/local-data-source.types'
import { listCompanyCraftByCategory, getItemSync } from '@/services/local-data-source'
import { getTotalMaterials } from '@/stores/workshop-projects'
import { CATEGORY_META, SLOT_LABEL } from '@/utils/company-craft-labels'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [projectId: string]
}>()

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
  const totals = getTotalMaterials(fakeProj as never, selectedSequences.value)
  const kinds = totals.size
  let totalPhases = 0
  for (const s of selectedSequences.value) totalPhases += s.phases.length
  return { kinds, totalPhases }
})

function getResultName(seq: CompanyCraftSequence): string {
  return getItemSync(seq.resultItemId)?.name ?? `#${seq.resultItemId}`
}

const canProceedFromStep2 = computed(() => selectedSequences.value.length > 0)

function reset() {
  step.value = 1
  category.value = null
  slotChoices.value = { bow: null, stern: null, hull: null, bridge: null }
  workshopPickId.value = null
  workshopFilter.value = ''
}

watch(visible, v => {
  if (v) reset()
})

function pickCategory(c: CompanyCraftCategory) {
  category.value = c
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
  <el-dialog v-model="visible" :width="560" :show-close="false" align-center class="cc-dialog">
    <template #header>
      <div class="head">
        <h4>{{ step === 1 ? '新增專案' : step === 2 ? '配置零件' : '命名專案' }}</h4>
        <span class="step-counter">Step {{ step }} / 3</span>
      </div>
    </template>

    <div v-if="step === 1" class="step1">
      <h5>做什麼？</h5>
      <div class="type-grid">
        <button
          v-for="(meta, c) in CATEGORY_META"
          :key="c"
          class="type-card"
          :class="{ active: category === c }"
          @click="pickCategory(c as CompanyCraftCategory)"
        >
          <div class="icon">{{ meta.icon }}</div>
          <div class="name">{{ meta.label }}</div>
          <div class="hint">{{ meta.hint }}</div>
        </button>
      </div>
    </div>

    <div v-else-if="step === 2" class="step2">
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
        <div class="ws-list">
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
        預估總素材 <strong>{{ estimate.kinds }} 種</strong>
        ， <strong>{{ estimate.totalPhases }} 個 Phase</strong>
      </div>
    </div>
    <div v-else class="step3">
      <p style="color: var(--app-text-muted);">[Task 18 fills naming step]</p>
    </div>

    <template #footer>
      <div class="footer">
        <el-button v-if="step === 1" @click="visible = false">取消</el-button>
        <el-button v-else @click="prevStep">← 上一步</el-button>
        <el-button
          type="primary"
          :disabled="(step === 1 && !category) || (step === 2 && !canProceedFromStep2)"
          @click="step === 3 ? null : nextStep()"
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
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--app-text-muted);
  text-transform: uppercase;
}
.step1 h5 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  margin: 0 0 16px;
}
.type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.type-card {
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 18px 12px;
  text-align: center;
  background: var(--app-surface);
  cursor: pointer;
  transition: all 0.15s var(--ease-out-quart);
  color: inherit;
}
.type-card:hover {
  background: var(--app-surface-hover);
  border-color: var(--app-accent);
  transform: translateY(-1px);
}
.type-card.active {
  background: var(--app-accent-glow);
  border-color: var(--app-accent);
  border-width: 2px;
}
.type-card .icon { font-size: 32px; margin-bottom: 6px; }
.type-card .name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
}
.type-card .hint {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  color: var(--app-text-muted);
  letter-spacing: 0.06em;
  margin-top: 4px;
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

/* Step 2 — preview strip */
.preview {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--app-text-muted);
}

@media (max-width: 640px) {
  .type-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
