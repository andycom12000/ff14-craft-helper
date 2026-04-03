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

    <div class="job-grid">
      <div v-for="row in tableData" :key="row.job" class="job-card">
        <div class="job-card-header">
          <span class="job-icon">{{ JOB_ICONS[row.job] }}</span>
          <span class="job-name">{{ JOB_NAMES[row.job] }}</span>
          <span class="job-level-badge">Lv.{{ row.level }}</span>
        </div>
        <div class="job-card-fields">
          <div class="job-field">
            <label>等級</label>
            <el-input-number
              :model-value="row.level"
              @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
              :min="1" :max="100" size="small" />
          </div>
          <div class="job-field">
            <label>作業精度</label>
            <el-input-number
              :model-value="row.craftsmanship"
              @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
              :min="0" :max="9999" size="small" />
          </div>
          <div class="job-field">
            <label>加工精度</label>
            <el-input-number
              :model-value="row.control"
              @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
              :min="0" :max="9999" size="small" />
          </div>
          <div class="job-field">
            <label>CP</label>
            <el-input-number
              :model-value="row.cp"
              @update:model-value="(v: number) => store.updateGearset(row.job, { cp: v })"
              :min="0" :max="9999" size="small" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container { --page-accent: var(--app-craft); --page-accent-dim: var(--app-craft-dim); }

.job-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.job-card {
  background: var(--app-surface, #161822);
  border: 1px solid var(--app-border, rgba(148,163,184,0.12));
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}

.job-card:hover {
  border-color: rgba(245, 158, 11, 0.18);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
}

.job-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--app-border, rgba(148,163,184,0.12));
}

.job-icon {
  font-size: 20px;
  line-height: 1;
}

.job-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--app-text, #E2E8F0);
}

.job-level-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-craft, #F59E0B);
  background: var(--app-craft-dim, rgba(245,158,11,0.12));
  padding: 2px 8px;
  border-radius: 4px;
}

.job-card-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.job-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.job-field label {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
}

.job-field .el-input-number {
  width: 100%;
}

@media (max-width: 1024px) {
  .job-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .job-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
