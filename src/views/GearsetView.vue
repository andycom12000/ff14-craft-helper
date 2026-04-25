<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useGearsetsStore, type GearsetStats } from '@/stores/gearsets'
import { useIsMobile } from '@/composables/useMediaQuery'
import { JOB_NAMES } from '@/utils/jobs'

const store = useGearsetsStore()

const jobs = Object.keys(JOB_NAMES)

const JOB_ICONS: Record<string, string> = {
  CRP: '🪓', BSM: '⚒️', ARM: '🛡️', GSM: '💍',
  LTW: '🧶', WVR: '🪡', ALC: '⚗️', CUL: '🍳',
}

const isMobile = useIsMobile()

const tableData = computed(() =>
  jobs.map(job => ({ job, ...store.gearsets[job] }))
)

// Bulk-edit panel state (shared by desktop collapsible and mobile bottom sheet)
const bulkOpen = ref(false)
const bulkLevel = ref<number | undefined>(undefined)
const bulkCraftsmanship = ref<number | undefined>(undefined)
const bulkControl = ref<number | undefined>(undefined)
const bulkCp = ref<number | undefined>(undefined)

// Mobile accordion: which job is expanded
const expandedJob = ref<string | null>(null)
function toggleJob(job: string) {
  expandedJob.value = expandedJob.value === job ? null : job
}

// Visual "saved" feedback: briefly highlight the row whose value just changed
const flashingJob = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

function updateJob(job: string, patch: Partial<GearsetStats>) {
  store.updateGearset(job, patch)
  flashingJob.value = job
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashingJob.value = null }, 450)
}

function updateJobField(job: string, field: keyof GearsetStats, raw: string) {
  const n = Number(raw)
  if (Number.isFinite(n)) updateJob(job, { [field]: n })
}

onUnmounted(() => {
  if (flashTimer) clearTimeout(flashTimer)
})

const bulkHasAnyValue = computed(() =>
  bulkLevel.value !== undefined
  || bulkCraftsmanship.value !== undefined
  || bulkControl.value !== undefined
  || bulkCp.value !== undefined,
)

function toggleBulk() {
  bulkOpen.value = !bulkOpen.value
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

  // Clear inputs and collapse
  bulkLevel.value = undefined
  bulkCraftsmanship.value = undefined
  bulkControl.value = undefined
  bulkCp.value = undefined
  bulkOpen.value = false
}
</script>

<template>
  <div class="view-container" :class="{ 'is-mobile': isMobile }">
    <!-- ============= Desktop / tablet ============= -->
    <template v-if="!isMobile">
      <h2>配裝管理</h2>
      <p class="view-desc view-desc--optional">填好裝備數值，模擬器就能幫你算出最佳手法。</p>

      <!-- Collapsible bulk-edit panel -->
      <div class="bulk-panel" :class="{ 'bulk-panel--open': bulkOpen }">
        <button
          type="button"
          class="bulk-trigger"
          :aria-expanded="bulkOpen"
          aria-controls="bulk-body"
          @click="toggleBulk"
        >
          <span class="bulk-trigger-icon" aria-hidden="true">⚙</span>
          <span>批次調整</span>
          <span class="bulk-trigger-chevron" :class="{ 'is-open': bulkOpen }" aria-hidden="true">▾</span>
        </button>

        <Transition name="bulk-collapse">
          <div v-if="bulkOpen" id="bulk-body" class="bulk-body-wrap">
            <div class="bulk-body">
              <p class="bulk-hint">只填想覆寫的欄位，留空的欄位不會動到。</p>
              <div class="bulk-fields">
                <div class="bulk-field">
                  <label for="bulk-level">Lv</label>
                  <el-input-number
                    id="bulk-level"
                    v-model="bulkLevel"
                    :min="1" :max="100" size="small"
                    placeholder="—"
                    :controls="false"
                    aria-label="批次 等級"
                  />
                </div>
                <div class="bulk-field">
                  <label for="bulk-craftsmanship">作業</label>
                  <el-input-number
                    id="bulk-craftsmanship"
                    v-model="bulkCraftsmanship"
                    :min="0" :max="9999" size="small"
                    placeholder="—"
                    :controls="false"
                    aria-label="批次 作業精度"
                  />
                </div>
                <div class="bulk-field">
                  <label for="bulk-control">加工</label>
                  <el-input-number
                    id="bulk-control"
                    v-model="bulkControl"
                    :min="0" :max="9999" size="small"
                    placeholder="—"
                    :controls="false"
                    aria-label="批次 加工精度"
                  />
                </div>
                <div class="bulk-field">
                  <label for="bulk-cp">CP</label>
                  <el-input-number
                    id="bulk-cp"
                    v-model="bulkCp"
                    :min="0" :max="9999" size="small"
                    placeholder="—"
                    :controls="false"
                    aria-label="批次 CP"
                  />
                </div>
                <el-popconfirm
                  title="這會蓋過全部 8 職現有的數值，確定嗎？"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  width="240"
                  @confirm="applyBulk"
                >
                  <template #reference>
                    <el-button
                      type="primary"
                      size="small"
                      class="bulk-apply-btn"
                      :disabled="!bulkHasAnyValue"
                    >
                      套用全部
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <div class="job-list">
        <div v-for="row in tableData" :key="row.job" class="job-row" :class="{ 'job-row--saved': flashingJob === row.job }">
          <div class="job-identity">
            <span class="job-icon">{{ JOB_ICONS[row.job] }}</span>
            <span class="job-name">{{ JOB_NAMES[row.job] }}</span>
          </div>
          <div class="job-fields">
            <div class="job-field">
              <label :for="`gearset-${row.job}-level`">Lv</label>
              <el-input-number
                :id="`gearset-${row.job}-level`"
                :model-value="row.level"
                @update:model-value="(v: number) => updateJob(row.job, { level: v })"
                :min="1" :max="100" size="small"
                :aria-label="`${JOB_NAMES[row.job]} 等級`"
              />
            </div>
            <div class="job-field">
              <label :for="`gearset-${row.job}-craftsmanship`">作業</label>
              <el-input-number
                :id="`gearset-${row.job}-craftsmanship`"
                :model-value="row.craftsmanship"
                @update:model-value="(v: number) => updateJob(row.job, { craftsmanship: v })"
                :min="0" :max="9999" size="small"
                :aria-label="`${JOB_NAMES[row.job]} 作業精度`"
              />
            </div>
            <div class="job-field">
              <label :for="`gearset-${row.job}-control`">加工</label>
              <el-input-number
                :id="`gearset-${row.job}-control`"
                :model-value="row.control"
                @update:model-value="(v: number) => updateJob(row.job, { control: v })"
                :min="0" :max="9999" size="small"
                :aria-label="`${JOB_NAMES[row.job]} 加工精度`"
              />
            </div>
            <div class="job-field">
              <label :for="`gearset-${row.job}-cp`">CP</label>
              <el-input-number
                :id="`gearset-${row.job}-cp`"
                :model-value="row.cp"
                @update:model-value="(v: number) => updateJob(row.job, { cp: v })"
                :min="0" :max="9999" size="small"
                :aria-label="`${JOB_NAMES[row.job]} CP`"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ============= Mobile: accordion + bottom-sheet bulk ============= -->
    <template v-else>
      <Teleport to="#mobile-bar-actions" defer>
        <button type="button" class="m-bulk-btn" @click="bulkOpen = true">
          <span aria-hidden="true">⚙</span>
          批次
        </button>
      </Teleport>

      <p class="m-sub">點一下展開編輯</p>

      <ul class="acc" role="list">
        <li
          v-for="row in tableData"
          :key="row.job"
          class="acc-item"
          :class="{
            'acc-item--open': expandedJob === row.job,
            'acc-item--saved': flashingJob === row.job,
          }"
        >
          <button
            type="button"
            class="acc-summary"
            :aria-expanded="expandedJob === row.job"
            @click="toggleJob(row.job)"
          >
            <span class="acc-icon" aria-hidden="true">{{ JOB_ICONS[row.job] }}</span>
            <span class="acc-name">{{ JOB_NAMES[row.job] }}</span>
            <span class="acc-meta" aria-hidden="true">
              Lv{{ row.level }}<span class="acc-dot">·</span>作{{ row.craftsmanship }}<span class="acc-dot">·</span>加{{ row.control }}<span class="acc-dot">·</span>CP{{ row.cp }}
            </span>
            <span class="acc-chevron" aria-hidden="true">▾</span>
          </button>

          <div v-if="expandedJob === row.job" class="acc-body">
            <div class="grid2">
              <label class="m-field">
                <span class="m-field-label">等級</span>
                <input
                  class="m-field-input"
                  type="number"
                  inputmode="numeric"
                  :value="row.level"
                  min="1" max="100"
                  :aria-label="`${JOB_NAMES[row.job]} 等級`"
                  @input="updateJobField(row.job, 'level', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="m-field">
                <span class="m-field-label">CP</span>
                <input
                  class="m-field-input"
                  type="number"
                  inputmode="numeric"
                  :value="row.cp"
                  min="0" max="9999"
                  :aria-label="`${JOB_NAMES[row.job]} CP`"
                  @input="updateJobField(row.job, 'cp', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="m-field">
                <span class="m-field-label">作業精度</span>
                <input
                  class="m-field-input"
                  type="number"
                  inputmode="numeric"
                  :value="row.craftsmanship"
                  min="0" max="9999"
                  :aria-label="`${JOB_NAMES[row.job]} 作業精度`"
                  @input="updateJobField(row.job, 'craftsmanship', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="m-field">
                <span class="m-field-label">加工精度</span>
                <input
                  class="m-field-input"
                  type="number"
                  inputmode="numeric"
                  :value="row.control"
                  min="0" max="9999"
                  :aria-label="`${JOB_NAMES[row.job]} 加工精度`"
                  @input="updateJobField(row.job, 'control', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>
        </li>
      </ul>

      <el-drawer
        v-model="bulkOpen"
        direction="btt"
        size="auto"
        :with-header="false"
        class="m-bulk-sheet"
        :append-to-body="true"
        :modal="true"
      >
        <div class="sheet">
          <div class="sheet-handle" aria-hidden="true" />
          <h3 class="sheet-title">批次調整</h3>
          <p class="sheet-hint">只填想覆寫的欄位，留空的不會動到。</p>

          <div class="sheet-grid">
            <label class="m-field">
              <span class="m-field-label">等級</span>
              <input
                class="m-field-input"
                type="number"
                inputmode="numeric"
                v-model.number="bulkLevel"
                min="1" max="100"
                placeholder="—"
                aria-label="批次 等級"
              />
            </label>
            <label class="m-field">
              <span class="m-field-label">CP</span>
              <input
                class="m-field-input"
                type="number"
                inputmode="numeric"
                v-model.number="bulkCp"
                min="0" max="9999"
                placeholder="—"
                aria-label="批次 CP"
              />
            </label>
            <label class="m-field">
              <span class="m-field-label">作業精度</span>
              <input
                class="m-field-input"
                type="number"
                inputmode="numeric"
                v-model.number="bulkCraftsmanship"
                min="0" max="9999"
                placeholder="—"
                aria-label="批次 作業精度"
              />
            </label>
            <label class="m-field">
              <span class="m-field-label">加工精度</span>
              <input
                class="m-field-input"
                type="number"
                inputmode="numeric"
                v-model.number="bulkControl"
                min="0" max="9999"
                placeholder="—"
                aria-label="批次 加工精度"
              />
            </label>
          </div>

          <el-popconfirm
            title="這會蓋過全部 8 職現有的數值，確定嗎？"
            confirm-button-text="確定"
            cancel-button-text="取消"
            width="240"
            @confirm="applyBulk"
          >
            <template #reference>
              <button
                type="button"
                class="sheet-apply"
                :disabled="!bulkHasAnyValue"
              >
                套用全部 8 職
              </button>
            </template>
          </el-popconfirm>
        </div>
      </el-drawer>
    </template>
  </div>
</template>

<style scoped>
.view-container {
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
  max-width: 960px;
}

/* ============================================================
   Desktop / tablet — original layout (unchanged)
   ============================================================ */

.bulk-panel {
  margin: 12px 0 16px;
  background: var(--app-surface, #161822);
  border: 1px solid var(--app-border, oklch(0.55 0.04 65 /0.12));
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out-quart, ease-out);
}

.bulk-panel--open {
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
  color: var(--app-text, #E2E8F0);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s var(--ease-out-quart, ease-out);
}

.bulk-trigger:hover {
  background: color-mix(in srgb, var(--app-accent) 6%, transparent);
}

.bulk-trigger:focus-visible {
  outline: 2px solid var(--app-accent-light, #A78BFA);
  outline-offset: 2px;
}

.bulk-trigger-icon {
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
}

.bulk-trigger-chevron {
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  transition: transform 0.2s var(--ease-out-quart, ease-out);
}

.bulk-trigger-chevron.is-open {
  transform: rotate(180deg);
}

.bulk-body-wrap {
  border-top: 1px solid var(--app-border, oklch(0.55 0.04 65 /0.12));
}

.bulk-body {
  padding: 12px 14px 14px;
}

.bulk-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
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
  min-width: 0;
}

.bulk-field label {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  white-space: nowrap;
}

.bulk-field .el-input-number {
  width: 110px;
}

.bulk-collapse-enter-active,
.bulk-collapse-leave-active {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.22s var(--ease-out-quart, ease-out);
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

.job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--app-surface, #161822);
  border: 1px solid var(--app-border, rgba(148,163,184,0.12));
  border-radius: 8px;
  transition: border-color 0.2s var(--ease-out-quart);
}

.job-row:hover {
  border-color: color-mix(in srgb, var(--app-craft) 18%, transparent);
}

.job-row--saved {
  border-color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 5%, var(--app-surface));
}

.job-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100px;
  flex-shrink: 0;
}

.job-icon {
  font-size: 18px;
  line-height: 1;
}

.job-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--app-text, #E2E8F0);
  white-space: nowrap;
}

.job-fields {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.job-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.job-field label {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  white-space: nowrap;
  flex-shrink: 0;
}

.job-field .el-input-number {
  flex: 1;
  min-width: 0;
  max-width: 140px;
}

/* Tablet: two-column stacked (still within desktop branch) */
@media (max-width: 768px) {
  .job-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px 12px;
  }

  .job-identity {
    width: auto;
  }

  .job-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .job-field .el-input-number {
    max-width: none;
  }

  .bulk-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .bulk-field .el-input-number {
    width: 100%;
  }

  .bulk-apply-btn {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}

/* ============================================================
   Mobile branch — accordion
   ============================================================ */

.m-sub {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--app-text-muted);
}

.m-bulk-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-accent) 28%, transparent);
  border-radius: 999px;
  color: var(--app-accent-light);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.m-bulk-btn:active {
  transform: scale(0.97);
}

.acc {
  list-style: none;
  padding: 0;
  margin: 0;
}

.acc-item {
  border-bottom: 1px solid var(--app-border);
  transition: background-color 0.2s var(--ease-out-quart);
}

.acc-item:first-child {
  border-top: 1px solid var(--app-border);
}

.acc-item--open {
  background: color-mix(in srgb, var(--app-accent) 4%, transparent);
}

.acc-item--saved {
  background: color-mix(in srgb, var(--app-success) 8%, transparent);
}

.acc-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 2px;
  background: transparent;
  border: 0;
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.acc-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.acc-name {
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
  min-width: 64px;
}

.acc-meta {
  flex: 1;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.acc-dot {
  opacity: 0.4;
  margin: 0 3px;
}

.acc-chevron {
  color: var(--app-text-muted);
  font-size: 12px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.acc-item--open .acc-chevron {
  transform: rotate(180deg);
  color: var(--app-accent-light);
}

.acc-item--open .acc-name {
  color: var(--app-accent-light);
}

.acc-body {
  padding: 4px 2px 18px;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
}

/* Native mobile input style — no heavy borders, no el-input-number baggage */
.m-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.m-field-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.m-field-input {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  padding: 4px 0 6px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 18px;
  font-weight: 500;
  color: var(--app-text);
  width: 100%;
  min-width: 0;
  letter-spacing: 0.02em;
  transition: border-color 0.18s var(--ease-out-quart, ease-out);
}

.m-field-input::-webkit-outer-spin-button,
.m-field-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.m-field-input:focus {
  outline: none;
  border-bottom-color: var(--app-accent-light);
}

/* Bottom sheet for bulk editing */
:global(.m-bulk-sheet.el-drawer) {
  border-radius: 20px 20px 0 0;
  background: var(--app-surface) !important;
  border-top: 1px solid var(--app-border);
}

:global(.m-bulk-sheet .el-drawer__body) {
  padding: 0 !important;
}

.sheet {
  padding: 8px 20px 24px;
  color: var(--app-text);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--app-border);
  border-radius: 999px;
  margin: 0 auto 14px;
}

.sheet-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.sheet-hint {
  margin: 0 0 18px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.sheet-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 20px;
  margin-bottom: 22px;
}

.sheet-grid .m-field-input {
  font-size: 20px;
}

.sheet-apply {
  width: 100%;
  padding: 13px 16px;
  background: var(--app-accent);
  border: 0;
  border-radius: 10px;
  color: white;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s var(--ease-out-quart, ease-out);
}

.sheet-apply:hover:not(:disabled) {
  filter: brightness(1.1);
}

.sheet-apply:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
