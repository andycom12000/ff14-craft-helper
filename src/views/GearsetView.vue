<script setup lang="ts">
import { computed } from 'vue'
import { useGearsetsStore } from '@/stores/gearsets'
import { JOB_NAMES } from '@/utils/jobs'

const store = useGearsetsStore()

const jobs = Object.keys(JOB_NAMES)

const tableData = computed(() =>
  jobs.map(job => ({ job, ...store.gearsets[job] }))
)
</script>

<template>
  <div class="view-container">
    <h2>配裝管理</h2>
    <p class="view-desc">設定各製作職業的裝備數值，用於製作模擬計算。</p>

    <!-- Desktop: table layout -->
    <el-card shadow="never" class="desktop-table">
      <el-table :data="tableData" stripe style="width: 100%">
        <el-table-column label="職業" min-width="100" align="center">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ JOB_NAMES[row.job] }}</span>
          </template>
        </el-table-column>

        <el-table-column label="等級" min-width="130" align="center">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.level"
              @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
              :min="1" :max="100" size="small" controls-position="right"
            />
          </template>
        </el-table-column>

        <el-table-column label="作業精度" min-width="160" align="center">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.craftsmanship"
              @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </template>
        </el-table-column>

        <el-table-column label="加工精度" min-width="160" align="center">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.control"
              @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </template>
        </el-table-column>

        <el-table-column label="CP" min-width="140" align="center">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.cp"
              @update:model-value="(v: number) => store.updateGearset(row.job, { cp: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Mobile: card layout -->
    <div class="mobile-cards">
      <el-card v-for="row in tableData" :key="row.job" shadow="never" class="job-card">
        <div class="job-card-header">{{ JOB_NAMES[row.job] }}</div>
        <div class="job-card-fields">
          <div class="job-field">
            <label>等級</label>
            <el-input-number
              :model-value="row.level"
              @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
              :min="1" :max="100" size="small" controls-position="right"
            />
          </div>
          <div class="job-field">
            <label>作業精度</label>
            <el-input-number
              :model-value="row.craftsmanship"
              @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </div>
          <div class="job-field">
            <label>加工精度</label>
            <el-input-number
              :model-value="row.control"
              @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </div>
          <div class="job-field">
            <label>CP</label>
            <el-input-number
              :model-value="row.cp"
              @update:model-value="(v: number) => store.updateGearset(row.job, { cp: v })"
              :min="0" :max="9999" size="small" controls-position="right"
            />
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.mobile-cards {
  display: none;
}

@media (max-width: 768px) {
  .desktop-table {
    display: none;
  }

  .mobile-cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .job-card-header {
    font-weight: 600;
    font-size: 16px;
    margin-bottom: 12px;
    color: var(--app-accent-light);
  }

  .job-card-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .job-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .job-field label {
    font-size: 12px;
    color: var(--app-text-muted);
  }

  .job-field .el-input-number {
    width: 100%;
  }
}
</style>
