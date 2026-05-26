<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useGearsetsStore, type GearsetStats } from '@/stores/gearsets'
import { JOB_NAMES } from '@/utils/jobs'
import { trackEvent } from '@/utils/analytics'
import { specialistCount } from '@/services/specialist-state'

const SPECIALIST_TOKEN_LIMIT = 3

const props = defineProps<{
  open: boolean
  focusJob?: string | null
  missingJobs?: string[]
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useGearsetsStore()
const allJobs = Object.keys(JOB_NAMES)
const JOB_ICONS: Record<string, string> = {
  CRP: '🪓', BSM: '⚒️', ARM: '🛡️', GSM: '💍',
  LTW: '🧶', WVR: '🪡', ALC: '⚗️', CUL: '🍳',
}

const orderedJobs = computed(() => {
  const focus = props.focusJob
  const missing = new Set(props.missingJobs ?? [])
  return [...allJobs].sort((a, b) => {
    const aFocus = a === focus ? 0 : 1
    const bFocus = b === focus ? 0 : 1
    if (aFocus !== bFocus) return aFocus - bFocus
    const aMissing = missing.has(a) ? 0 : 1
    const bMissing = missing.has(b) ? 0 : 1
    if (aMissing !== bMissing) return aMissing - bMissing
    return allJobs.indexOf(a) - allJobs.indexOf(b)
  })
})

const tableData = computed(() =>
  orderedJobs.value.map(job => ({ job, ...store.gearsets[job] })),
)

const missingSet = computed(() => new Set(props.missingJobs ?? []))

const currentSpecialistCount = computed(() => specialistCount(store.gearsets))
const specialistOverLimit = computed(() => currentSpecialistCount.value > SPECIALIST_TOKEN_LIMIT)

// Defer mounting the heavy 8×4 el-input-number grid until after the drawer's
// open frame has painted. Mounting 32 el-input-number synchronously inside the
// click handler forced ~290ms of Element Plus layout reflow → a poor INP
// (~550ms measured on a throttled mid-tier profile). Initialised from `open` so
// an already-open mount still renders the body immediately.
const bodyReady = ref(props.open)

const bulkOpen = ref(false)
const bulkLevel = ref<number | undefined>(undefined)
const bulkCraftsmanship = ref<number | undefined>(undefined)
const bulkControl = ref<number | undefined>(undefined)
const bulkCp = ref<number | undefined>(undefined)
const bulkHasAnyValue = computed(() =>
  bulkLevel.value !== undefined
  || bulkCraftsmanship.value !== undefined
  || bulkControl.value !== undefined
  || bulkCp.value !== undefined,
)

const flashingJob = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
function updateJob(job: string, patch: Partial<GearsetStats>) {
  store.updateGearset(job, patch)
  flashingJob.value = job
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashingJob.value = null }, 450)
}

function applyBulk() {
  const patch: Partial<GearsetStats> = {}
  if (bulkLevel.value !== undefined) patch.level = bulkLevel.value
  if (bulkCraftsmanship.value !== undefined) patch.craftsmanship = bulkCraftsmanship.value
  if (bulkControl.value !== undefined) patch.control = bulkControl.value
  if (bulkCp.value !== undefined) patch.cp = bulkCp.value
  if (Object.keys(patch).length === 0) {
    ElMessage.warning('請至少填一個欄位')
    return
  }
  store.updateAllGearsets(patch)
  ElMessage.success('8 職全部更新完成')
  bulkLevel.value = undefined
  bulkCraftsmanship.value = undefined
  bulkControl.value = undefined
  bulkCp.value = undefined
  bulkOpen.value = false
}

const hint = computed(() => {
  if (props.focusJob) {
    const name = JOB_NAMES[props.focusJob] || props.focusJob
    return `先把 ${name} 填好，回到配方繼續`
  }
  if (props.missingJobs && props.missingJobs.length > 0) {
    return `補完這 ${props.missingJobs.length} 職，就能跑最佳化`
  }
  return null
})

watch(() => props.open, (open) => {
  if (open) {
    trackEvent('gearset_sheet_open', {
      focus_job: props.focusJob ?? '',
      missing_count: props.missingJobs?.length ?? 0,
    })
    // Two rAFs: the first lets the drawer-open frame paint with just the shell,
    // the second mounts the input grid in the next frame — off the interaction's
    // critical path. Autofocus waits for the grid to exist.
    bodyReady.value = false
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bodyReady.value = true
      if (props.focusJob) {
        nextTick(() => {
          const el = document.querySelector(
            `[data-gs-row="${props.focusJob}"] [data-gs-field="craftsmanship"] input`,
          ) as HTMLInputElement | null
          el?.focus()
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }))
  } else {
    bodyReady.value = false
    bulkOpen.value = false
  }
})

function handleClose() {
  emit('update:open', false)
}

onUnmounted(() => {
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <el-drawer
    :model-value="open"
    direction="btt"
    size="auto"
    :with-header="false"
    :append-to-body="true"
    :modal="true"
    :close-on-press-escape="true"
    :close-on-click-modal="true"
    class="gs-sheet"
    @update:model-value="(v: boolean) => emit('update:open', v)"
  >
    <div class="sheet">
      <div class="handle" aria-hidden="true" />

      <header class="sheet-head">
        <p class="sheet-eyebrow">VIII · GEARSETS</p>
        <h2 class="sheet-title">配裝</h2>
        <p class="sheet-sub">填好裝備數值，模擬器就能算出最佳手法</p>
      </header>

      <div v-if="hint" class="hint">{{ hint }}</div>

      <!-- Specialist status line — permanent context, sits between head and bulk -->
      <div class="specialist-status" :class="{ 'is-over-limit': specialistOverLimit }">
        <div class="specialist-status-row">
          <span class="specialist-pill">專家配置</span>
          <span class="specialist-count">
            <span class="specialist-count-num">{{ currentSpecialistCount }}</span>
            <span class="specialist-count-sep"> / </span>
            <span class="specialist-count-limit">{{ SPECIALIST_TOKEN_LIMIT }}</span>
          </span>
          <span v-if="specialistOverLimit" class="specialist-warning">
            遊戲內最多 {{ SPECIALIST_TOKEN_LIMIT }} 個 specialist token
          </span>
        </div>
        <div class="specialist-status-underline" aria-hidden="true" />
      </div>

      <!-- Bulk panel -->
      <div class="bulk-panel" :class="{ 'is-open': bulkOpen }">
        <button
          type="button"
          class="bulk-trigger"
          :aria-expanded="bulkOpen"
          @click="bulkOpen = !bulkOpen"
        >
          <span class="bulk-trigger-icon" aria-hidden="true">⚙</span>
          <span>批次調整</span>
          <span class="bulk-trigger-hint">點開可一次套用 8 職</span>
          <span class="bulk-trigger-chev" :class="{ 'is-open': bulkOpen }" aria-hidden="true">▾</span>
        </button>
        <Transition name="bulk-collapse">
          <div v-if="bulkOpen" class="bulk-body-wrap">
            <div class="bulk-body">
              <p class="bulk-hint">只填想覆寫的欄位，留空的不會動到。</p>
              <div class="bulk-fields">
                <div class="bulk-field">
                  <label for="gs-bulk-level">Lv</label>
                  <el-input-number
                    id="gs-bulk-level" v-model="bulkLevel"
                    :min="1" :max="100" size="small" placeholder="—" :controls="false"
                    aria-label="批次 等級"
                  />
                </div>
                <div class="bulk-field">
                  <label for="gs-bulk-craft">作業</label>
                  <el-input-number
                    id="gs-bulk-craft" v-model="bulkCraftsmanship"
                    :min="0" :max="9999" size="small" placeholder="—" :controls="false"
                    aria-label="批次 作業精度"
                  />
                </div>
                <div class="bulk-field">
                  <label for="gs-bulk-control">加工</label>
                  <el-input-number
                    id="gs-bulk-control" v-model="bulkControl"
                    :min="0" :max="9999" size="small" placeholder="—" :controls="false"
                    aria-label="批次 加工精度"
                  />
                </div>
                <div class="bulk-field">
                  <label for="gs-bulk-cp">CP</label>
                  <el-input-number
                    id="gs-bulk-cp" v-model="bulkCp"
                    :min="0" :max="9999" size="small" placeholder="—" :controls="false"
                    aria-label="批次 CP"
                  />
                </div>
                <el-popconfirm
                  title="這會蓋過全部 8 職現有的數值，確定嗎？"
                  confirm-button-text="確定" cancel-button-text="取消" width="240"
                  @confirm="applyBulk"
                >
                  <template #reference>
                    <el-button type="primary" size="small" :disabled="!bulkHasAnyValue">套用全部</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 8 jobs list — deferred one frame after open so the 32 el-input-number
           mount doesn't block the opening interaction (INP). Placeholder reserves
           height so the drawer doesn't visibly resize while it fills in. -->
      <div v-if="!bodyReady" class="job-list-placeholder" aria-hidden="true" />
      <div v-else class="job-list">
        <div
          v-for="row in tableData"
          :key="row.job"
          class="job-row"
          :class="{
            'is-focus': row.job === props.focusJob,
            'is-missing': missingSet.has(row.job),
            'is-saved': flashingJob === row.job,
            'is-specialist': row.isSpecialist,
          }"
          :data-gs-row="row.job"
        >
          <div class="job-id">
            <span class="job-icon" aria-hidden="true">{{ JOB_ICONS[row.job] }}</span>
            <span class="job-name">{{ JOB_NAMES[row.job] }}</span>
          </div>
          <div class="job-fields">
            <div class="job-field" data-gs-field="level">
              <label :for="`gs-${row.job}-level`">Lv</label>
              <el-input-number
                :id="`gs-${row.job}-level`"
                :model-value="row.level"
                @update:model-value="(v: number) => updateJob(row.job, { level: v })"
                :min="1" :max="100" size="small" :controls="false"
                :aria-label="`${JOB_NAMES[row.job]} 等級`"
              />
            </div>
            <div class="job-field" data-gs-field="craftsmanship">
              <label :for="`gs-${row.job}-craft`">作業</label>
              <el-input-number
                :id="`gs-${row.job}-craft`"
                :model-value="row.craftsmanship"
                @update:model-value="(v: number) => updateJob(row.job, { craftsmanship: v })"
                :min="0" :max="9999" size="small" :controls="false"
                :aria-label="`${JOB_NAMES[row.job]} 作業精度`"
              />
            </div>
            <div class="job-field" data-gs-field="control">
              <label :for="`gs-${row.job}-control`">加工</label>
              <el-input-number
                :id="`gs-${row.job}-control`"
                :model-value="row.control"
                @update:model-value="(v: number) => updateJob(row.job, { control: v })"
                :min="0" :max="9999" size="small" :controls="false"
                :aria-label="`${JOB_NAMES[row.job]} 加工精度`"
              />
            </div>
            <div class="job-field" data-gs-field="cp">
              <label :for="`gs-${row.job}-cp`">CP</label>
              <el-input-number
                :id="`gs-${row.job}-cp`"
                :model-value="row.cp"
                @update:model-value="(v: number) => updateJob(row.job, { cp: v })"
                :min="0" :max="9999" size="small" :controls="false"
                :aria-label="`${JOB_NAMES[row.job]} CP`"
              />
            </div>
          </div>
          <div
            class="job-specialist"
            :class="{ 'is-on': row.isSpecialist }"
            data-gs-field="specialist"
          >
            <el-checkbox
              :model-value="row.isSpecialist"
              @update:model-value="(v: boolean | string | number) => updateJob(row.job, { isSpecialist: !!v })"
              :aria-label="`${JOB_NAMES[row.job]} 設為專家`"
            >
              <span class="job-specialist-label">專家</span>
            </el-checkbox>
          </div>
        </div>
      </div>

      <footer class="sheet-foot">
        <span class="save-status">自動儲存 · ESC 關閉</span>
        <button type="button" class="done-btn" @click="handleClose">完成</button>
      </footer>
    </div>
  </el-drawer>
</template>

<style scoped>
.sheet {
  --gs-page: 18px;
  padding: 4px var(--gs-page) calc(var(--gs-page) + 4px);
  color: var(--app-text);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(85vh - 24px);
}

.handle {
  width: 36px;
  height: 4px;
  background: var(--app-border);
  border-radius: 999px;
  margin: 6px auto 2px;
}

.sheet-head {
  padding: 4px 4px 0;
}
.sheet-eyebrow {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--app-accent);
  margin: 0 0 4px;
}
.sheet-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 22px;
  margin: 0 0 4px;
  color: var(--app-text);
  line-height: 1.2;
}
.sheet-sub {
  font-size: 13px;
  color: var(--app-text-muted);
  margin: 0;
}

.hint {
  background: oklch(0.58 0.17 45 / 0.10);
  border-left: 3px solid var(--app-warning, oklch(0.58 0.17 45));
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: oklch(0.32 0.14 45);
}

/* Specialist status line — Editorial Hero echo (eyebrow pill + chalk underline).
 * Permanent context between sheet-head and bulk-panel; no border-left stripe,
 * no modal, no el-alert default — per DESIGN.md. */
.specialist-status {
  padding: 2px 4px 0;
}
.specialist-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.specialist-pill {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--brand-cocoa);
  background: var(--brand-cocoa-glow);
  padding: 3px 8px;
  border-radius: 999px;
  line-height: 1;
}
.specialist-count {
  margin-left: auto;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  color: var(--brand-cocoa);
  font-variant-numeric: tabular-nums;
}
.specialist-count-sep,
.specialist-count-limit {
  color: var(--brand-cocoa);
  opacity: 0.75;
}
.specialist-status.is-over-limit .specialist-count-num {
  color: var(--app-warning);
  font-weight: 600;
}
.specialist-status.is-over-limit .specialist-count {
  /* keep label colour cocoa, only the number shifts */
  color: var(--brand-cocoa);
}
.specialist-warning {
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 13px;
  color: var(--app-text-muted);
  flex-basis: 100%;
  margin-top: -2px;
}
.specialist-status-underline {
  height: 1px;
  width: 56px;
  background: color-mix(in srgb, var(--brand-cocoa) 55%, transparent);
  margin-top: 6px;
}

/* Per-row specialist toggle — cocoa-glow wash when active. No border-left stripe. */
.job-specialist {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 6px;
  transition: background-color 0.18s var(--ease-out-quart);
  min-width: 76px;
}
.job-specialist.is-on {
  background: var(--brand-cocoa-glow);
}
.job-specialist-label {
  font-size: 13px;
  color: var(--app-text);
  font-weight: 500;
}
.job-specialist.is-on .job-specialist-label {
  color: var(--brand-cocoa);
  font-weight: 600;
}
.job-specialist :deep(.el-checkbox) {
  height: auto;
  margin-right: 0;
}
.job-specialist :deep(.el-checkbox__label) {
  padding-left: 6px;
}

/* Bulk panel — same pattern as GearsetView desktop */
.bulk-panel {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out-quart);
  /* overflow:hidden makes min-height:auto resolve to 0 in flex column,
     so without this the sheet's max-height can squash this below the
     trigger/body — clipping the panel content. */
  flex-shrink: 0;
}
.bulk-panel.is-open {
  border-color: color-mix(in srgb, var(--app-accent) 32%, transparent);
}
.bulk-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: 0;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.bulk-trigger:hover {
  background: color-mix(in srgb, var(--app-accent) 6%, transparent);
}
.bulk-trigger:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.bulk-trigger-icon { font-size: 14px; opacity: 0.85; }
.bulk-trigger-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--app-text-muted);
  font-weight: 400;
}
.bulk-trigger-chev {
  font-size: 12px;
  color: var(--app-text-muted);
  transition: transform 0.18s var(--ease-out-quart);
  margin-left: 6px;
}
.bulk-trigger-chev.is-open { transform: rotate(180deg); }

.bulk-body-wrap {
  border-top: 1px solid var(--app-border);
}
.bulk-body { padding: 12px 14px 14px; }
.bulk-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.bulk-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.bulk-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bulk-field label {
  font-size: 12px;
  color: var(--app-text-muted);
}
.bulk-field :deep(.el-input-number) { width: 110px; }

.bulk-collapse-enter-active,
.bulk-collapse-leave-active {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.22s var(--ease-out-quart);
}
.bulk-collapse-enter-from,
.bulk-collapse-leave-to {
  grid-template-rows: 0fr;
}
.bulk-collapse-enter-active > *,
.bulk-collapse-leave-active > * {
  overflow: hidden;
  min-height: 0;
}

/* job list */
.job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 2px;
  margin: 0 -2px;
}
/* Reserves roughly the grid's height for the ~1 frame before the inputs mount,
   so the bottom-anchored drawer doesn't jump as the body fills in. */
.job-list-placeholder {
  flex: 1;
  min-height: 420px;
}
.job-row {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 10px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  transition:
    border-color 0.18s var(--ease-out-quart),
    background-color 0.18s var(--ease-out-quart),
    box-shadow 0.18s var(--ease-out-quart);
}
.job-row:hover {
  border-color: color-mix(in srgb, var(--app-craft) 28%, var(--app-border));
}
.job-row.is-missing {
  border-color: color-mix(in srgb, var(--app-craft) 45%, transparent);
  background: color-mix(in srgb, var(--app-craft) 4%, var(--app-surface));
}
.job-row.is-focus {
  border: 1.5px solid var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 8%, var(--app-surface));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 12%, transparent);
}
.job-row.is-saved {
  border-color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 6%, var(--app-surface));
}
.job-id {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.job-icon { font-size: 18px; line-height: 1; }
.job-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--app-text);
  white-space: nowrap;
}
.job-fields {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  min-width: 0;
}
.job-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.job-field label {
  font-size: 12px;
  color: var(--app-text-muted);
  flex-shrink: 0;
  width: 26px;
}
.job-field :deep(.el-input-number) {
  flex: 1;
  min-width: 0;
}

.sheet-foot {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.save-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-success);
}
.done-btn {
  padding: 9px 22px;
  background: var(--app-accent);
  color: var(--app-surface);
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s var(--ease-out-quart), transform 0.12s var(--ease-out-quart);
}
.done-btn:hover {
  background: var(--app-accent-light);
  transform: translateY(-1px);
}
.done-btn:active { transform: translateY(0); }

/* mobile: 4 fields stack into 2 cols, specialist toggle drops to its own row */
@media (max-width: 768px) {
  .job-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .job-fields {
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .job-specialist {
    justify-content: flex-start;
    padding: 6px 10px;
  }
  .bulk-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .bulk-field :deep(.el-input-number) { width: 100%; }
}
</style>

<style>
/* Drawer container — desktop center + max width 880, mobile full width */
.gs-sheet.el-drawer {
  background: var(--app-surface) !important;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid var(--app-border);
  box-shadow: 0 -10px 50px oklch(0.20 0.05 60 / 0.18);
  max-width: 880px !important;
  margin: 0 auto;
  left: 0 !important;
  right: 0 !important;
}
.gs-sheet .el-drawer__body {
  padding: 0 !important;
}
@media (max-width: 768px) {
  .gs-sheet.el-drawer {
    max-width: 100% !important;
    border-radius: 16px 16px 0 0;
  }
}
</style>
