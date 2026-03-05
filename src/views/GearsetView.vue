<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useGearsetsStore } from '@/stores/gearsets'
import { JOB_NAMES } from '@/utils/jobs'

const store = useGearsetsStore()

const jobs = Object.keys(JOB_NAMES)

const tableData = computed(() =>
  jobs.map(job => ({ job, ...store.gearsets[job] }))
)

function getRowClassName({ row }: { row: { job: string } }): string {
  return row.job === store.activeJob ? 'active-row' : ''
}

function handleSetActive(job: string) {
  store.setActive(job)
  ElMessage.success(`已切換啟用職業：${JOB_NAMES[job]}`)
}
</script>

<template>
  <div class="view-container">
    <h2>配裝管理</h2>

    <el-table :data="tableData" stripe style="width: 100%"
      :row-class-name="getRowClassName">
      <el-table-column label="職業" width="120" align="center">
        <template #default="{ row }">
          <span :class="{ 'active-job': row.job === store.activeJob }">
            {{ JOB_NAMES[row.job] }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="等級" width="130" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.level"
            @update:model-value="(v: number) => store.updateGearset(row.job, { level: v })"
            :min="1" :max="100" size="small" controls-position="right"
          />
        </template>
      </el-table-column>

      <el-table-column label="作業精度" width="160" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.craftsmanship"
            @update:model-value="(v: number) => store.updateGearset(row.job, { craftsmanship: v })"
            :min="0" :max="9999" size="small" controls-position="right"
          />
        </template>
      </el-table-column>

      <el-table-column label="加工精度" width="160" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.control"
            @update:model-value="(v: number) => store.updateGearset(row.job, { control: v })"
            :min="0" :max="9999" size="small" controls-position="right"
          />
        </template>
      </el-table-column>

      <el-table-column label="CP" width="140" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.cp"
            @update:model-value="(v: number) => store.updateGearset(row.job, { cp: v })"
            :min="0" :max="9999" size="small" controls-position="right"
          />
        </template>
      </el-table-column>

      <el-table-column label="" min-width="100" align="center">
        <template #default="{ row }">
          <el-button
            size="small"
            :type="row.job === store.activeJob ? 'success' : 'default'"
            @click="handleSetActive(row.job)"
            :disabled="row.job === store.activeJob"
          >
            {{ row.job === store.activeJob ? '使用中' : '啟用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.view-container {
  padding: 20px;
}

.view-container h2 {
  margin-top: 0;
  margin-bottom: 20px;
}

.active-job {
  font-weight: bold;
  color: var(--el-color-primary);
}

:deep(.active-row) {
  --el-table-tr-bg-color: rgba(64, 158, 255, 0.08);
}
</style>
