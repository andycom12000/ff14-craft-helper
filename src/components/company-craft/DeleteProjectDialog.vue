<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { WorkshopProject } from '@/stores/workshop-projects'
import { getProjectProgressDetail } from '@/stores/workshop-projects'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { CATEGORY_META } from '@/utils/company-craft-labels'

const props = defineProps<{
  project: WorkshopProject | null
  sequences: CompanyCraftSequence[]
  seqById?: Map<number, CompanyCraftSequence>
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [projectId: string]
}>()

const visible = computed({
  get: () => props.project !== null,
  set: v => { if (!v) emit('cancel') },
})

const cancelRef = ref<{ ref: HTMLButtonElement } | null>(null)

const detail = computed(() => {
  if (!props.project) return { done: 0, total: 0, ratio: 0 }
  return getProjectProgressDetail(props.project, props.sequences, props.seqById)
})

const meta = computed(() => props.project ? CATEGORY_META[props.project.category] : null)

const subline = computed(() => {
  if (!props.project || !meta.value) return ''
  const partsLabel = props.project.category === 'workshop'
    ? `${props.project.sequences.length} 件`
    : `${props.project.sequences.length} 零件`
  return `${meta.value.label} · ${partsLabel} · ${detail.value.done}/${detail.value.total} 階段已繳交`
})

function onConfirm() {
  if (!props.project) return
  emit('confirm', props.project.id)
}

watch(visible, async (v) => {
  if (v) {
    await nextTick()
    cancelRef.value?.ref?.focus()
  }
})
</script>

<template>
  <el-dialog
    v-model="visible"
    :width="440"
    :show-close="false"
    align-center
    class="cc-delete-dialog"
    aria-labelledby="cc-delete-title"
    aria-describedby="cc-delete-body"
  >
    <div v-if="project" class="cc-delete">
      <div class="chalk-rule" />

      <h3 id="cc-delete-title" class="title">刪除這個專案？</h3>

      <p class="name">「{{ project.name }}」</p>
      <p class="meta">{{ subline }}</p>

      <p id="cc-delete-body" class="body">
        <template v-if="detail.done === 0">
          目前還是個空白專案，可以放心移除。
        </template>
        <template v-else>
          已繳交的 <strong>{{ detail.done }}</strong> 個階段進度會一起清除，無法復原。
        </template>
      </p>

      <div class="footer">
        <el-button ref="cancelRef" @click="emit('cancel')">取消</el-button>
        <el-button class="danger-cta" @click="onConfirm">刪除這個專案</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.cc-delete {
  padding: 4px 4px 0;
}

.chalk-rule {
  height: 1px;
  background: linear-gradient(
    to right,
    var(--app-danger) 0 56px,
    color-mix(in srgb, var(--app-border) 90%, transparent) 56px 100%
  );
  opacity: 0.85;
  margin-bottom: 22px;
}

.title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.25;
  color: var(--app-text);
  margin: 0 0 14px;
}

.name {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--app-text-muted);
  margin: 0 0 4px;
  letter-spacing: -0.005em;
}

.meta {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--app-text-muted);
  margin: 0 0 18px;
  text-transform: none;
}

.body {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  color: var(--app-text-muted);
  margin: 0 0 24px;
  max-width: 36ch;
}

.body strong {
  color: var(--app-danger);
  font-weight: 600;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  letter-spacing: 0.04em;
  padding: 0 2px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.danger-cta {
  background: var(--app-danger);
  border-color: var(--app-danger);
  color: var(--app-surface);
  font-weight: 500;
}

.danger-cta:hover,
.danger-cta:focus-visible {
  background: color-mix(in srgb, var(--app-danger) 88%, oklch(0.20 0.05 25));
  border-color: color-mix(in srgb, var(--app-danger) 88%, oklch(0.20 0.05 25));
  color: var(--app-surface);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-danger) 28%, transparent);
}

.danger-cta:active {
  transform: translateY(1px);
}

@media (max-width: 640px) {
  .title { font-size: 20px; }
  .name { font-size: 20px; }
  .body { font-size: 13px; }
}
</style>
