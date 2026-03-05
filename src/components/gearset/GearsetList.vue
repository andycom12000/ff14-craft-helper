<script setup lang="ts">
import { Edit, Delete, Check, Plus } from '@element-plus/icons-vue'
import type { Gearset } from '@/stores/gearsets'

const props = defineProps<{
  gearsets: Gearset[]
  activeGearsetId: string | null
}>()

const emit = defineEmits<{
  add: []
  edit: [gearset: Gearset]
  delete: [id: string]
  setActive: [id: string]
}>()

function getRowClassName({ row }: { row: Gearset }): string {
  return row.id === props.activeGearsetId ? 'active-row' : ''
}
</script>

<template>
  <div class="gearset-list">
    <div class="list-header">
      <h3>配裝列表</h3>
      <el-button type="primary" :icon="Plus" @click="emit('add')">
        新增配裝
      </el-button>
    </div>

    <el-table
      :data="gearsets"
      :row-class-name="getRowClassName"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" label="名稱" min-width="120" />
      <el-table-column prop="job" label="職業" width="80" align="center" />
      <el-table-column prop="level" label="等級" width="70" align="center" />
      <el-table-column prop="craftsmanship" label="作業精度" width="100" align="center" />
      <el-table-column prop="control" label="加工精度" width="100" align="center" />
      <el-table-column prop="cp" label="CP" width="80" align="center" />
      <el-table-column label="操作" width="240" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="success"
            :icon="Check"
            :disabled="row.id === activeGearsetId"
            @click="emit('setActive', row.id)"
          >
            啟用
          </el-button>
          <el-button
            size="small"
            type="primary"
            :icon="Edit"
            @click="emit('edit', row)"
          >
            編輯
          </el-button>
          <el-popconfirm
            title="確定要刪除此配裝嗎？"
            confirm-button-text="確定"
            cancel-button-text="取消"
            @confirm="emit('delete', row.id)"
          >
            <template #reference>
              <el-button size="small" type="danger" :icon="Delete">
                刪除
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.gearset-list {
  width: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.list-header h3 {
  margin: 0;
  font-size: 18px;
}

:deep(.active-row) {
  --el-table-tr-bg-color: rgba(64, 158, 255, 0.08);
}
</style>
