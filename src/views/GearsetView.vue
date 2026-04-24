<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useGearsetsStore, type GearsetStats } from '@/stores/gearsets'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'
import { JOB_NAMES } from '@/utils/jobs'

const store = useGearsetsStore()

const jobs = Object.keys(JOB_NAMES)

const JOB_ICONS: Record<string, string> = {
  CRP: '🪓', BSM: '⚒️', ARM: '🛡️', GSM: '💍',
  LTW: '🧶', WVR: '🪡', ALC: '⚗️', CUL: '🍳',
}

const tableData = computed(() =>
  jobs.map(job => ({ job, ...store.gearsets[job] }))
)

// Bulk-edit panel state
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
  <div class="view-container">
    <FlowBreadcrumb :steps="[
      { label: '配裝', path: '/gearset', icon: '🛠️' },
      { label: '模擬', path: '/simulator', icon: '⚗️' },
    ]" />
    <h2>配裝管理</h2>
    <p class="view-desc">填好裝備數值，模擬器就能幫你算出最佳手法。</p>

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
      <div v-for="row in tableData" :key="row.job" class="job-row">
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
              @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
              :min="1" :max="100" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 等級`"
            />
          </div>
          <div class="job-field">
            <label :for="`gearset-${row.job}-craftsmanship`">作業</label>
            <el-input-number
              :id="`gearset-${row.job}-craftsmanship`"
              :model-value="row.craftsmanship"
              @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
              :min="0" :max="9999" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 作業精度`"
            />
          </div>
          <div class="job-field">
            <label :for="`gearset-${row.job}-control`">加工</label>
            <el-input-number
              :id="`gearset-${row.job}-control`"
              :model-value="row.control"
              @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
              :min="0" :max="9999" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 加工精度`"
            />
          </div>
          <div class="job-field">
            <label :for="`gearset-${row.job}-cp`">CP</label>
            <el-input-number
              :id="`gearset-${row.job}-cp`"
              :model-value="row.cp"
              @update:model-value="(v: number) => store.updateGearset(row.job, { cp: v })"
              :min="0" :max="9999" size="small"
              :aria-label="`${JOB_NAMES[row.job]} CP`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container {
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
  max-width: 960px;
}

/* Bulk-edit collapsible panel */
.bulk-panel {
  margin: 12px 0 16px;
  background: var(--app-surface, #161822);
  border: 1px solid var(--app-border, rgba(148, 163, 184, 0.12));
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out-quart, ease-out);
}

.bulk-panel--open {
  border-color: rgba(124, 58, 237, 0.32);
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
  background: rgba(124, 58, 237, 0.06);
}

.bulk-trigger:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--app-accent, rgba(124, 58, 237, 0.6));
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
  border-top: 1px solid var(--app-border, rgba(148, 163, 184, 0.12));
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

/* Grid-rows based collapse animation (performant, no height jank) */
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
  border-color: rgba(245, 158, 11, 0.18);
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

@media (max-width: 768px) {
  .job-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
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
}
</style>
