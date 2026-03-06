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

    <el-card shadow="never">
      <el-table :data="tableData" stripe style="width: 100%">
        <el-table-column label="職業" width="120" align="center">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ JOB_NAMES[row.job] }}</span>
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
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
</style>
