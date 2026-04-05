<script setup lang="ts">
import { computed } from 'vue'
import { useGearsetsStore } from '@/stores/gearsets'
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
</script>

<template>
  <div class="view-container">
    <FlowBreadcrumb :steps="[
      { label: '配裝', path: '/gearset', icon: '🛠️' },
      { label: '模擬', path: '/simulator', icon: '⚗️' },
    ]" />
    <h2>配裝管理</h2>
    <p class="view-desc">填好裝備數值，模擬器就能幫你算出最佳手法。</p>

    <div class="job-list">
      <div v-for="row in tableData" :key="row.job" class="job-row">
        <div class="job-identity">
          <span class="job-icon">{{ JOB_ICONS[row.job] }}</span>
          <span class="job-name">{{ JOB_NAMES[row.job] }}</span>
        </div>
        <div class="job-fields">
          <div class="job-field">
            <label>Lv</label>
            <el-input-number
              :model-value="row.level"
              @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
              :min="1" :max="100" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 等級`"
            />
          </div>
          <div class="job-field">
            <label>作業</label>
            <el-input-number
              :model-value="row.craftsmanship"
              @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
              :min="0" :max="9999" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 作業精度`"
            />
          </div>
          <div class="job-field">
            <label>加工</label>
            <el-input-number
              :model-value="row.control"
              @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
              :min="0" :max="9999" size="small"
              :aria-label="`${JOB_NAMES[row.job]} 加工精度`"
            />
          </div>
          <div class="job-field">
            <label>CP</label>
            <el-input-number
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
}
</style>
