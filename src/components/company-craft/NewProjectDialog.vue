<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CompanyCraftCategory } from '@/services/local-data-source.types'
import { CATEGORY_META } from '@/utils/company-craft-labels'

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

function reset() {
  step.value = 1
  category.value = null
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
      <p style="color: var(--app-text-muted);">[Task 17 fills slot configurator]</p>
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
          :disabled="step === 1 && !category"
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

@media (max-width: 640px) {
  .type-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
