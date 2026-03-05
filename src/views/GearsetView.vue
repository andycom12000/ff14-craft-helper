<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useGearsetsStore, type Gearset } from '@/stores/gearsets'
import GearsetList from '@/components/gearset/GearsetList.vue'
import GearsetEditor from '@/components/gearset/GearsetEditor.vue'

const store = useGearsetsStore()

const editorVisible = ref(false)
const editingGearset = ref<Gearset | null>(null)

function handleAdd() {
  editingGearset.value = null
  editorVisible.value = true
}

function handleEdit(gearset: Gearset) {
  editingGearset.value = gearset
  editorVisible.value = true
}

function handleDelete(id: string) {
  store.removeGearset(id)
  ElMessage.success('已刪除配裝')
}

function handleSetActive(id: string) {
  store.setActive(id)
  ElMessage.success('已切換啟用配裝')
}

function handleSave(data: Omit<Gearset, 'id' | 'createdAt'>) {
  if (editingGearset.value) {
    store.updateGearset(editingGearset.value.id, data)
    ElMessage.success('已更新配裝')
  } else {
    store.addGearset(data)
    ElMessage.success('已新增配裝')
  }
}
</script>

<template>
  <div class="view-container">
    <h2>配裝管理</h2>

    <template v-if="store.gearsets.length > 0">
      <GearsetList
        :gearsets="store.gearsets"
        :active-gearset-id="store.activeGearsetId"
        @add="handleAdd"
        @edit="handleEdit"
        @delete="handleDelete"
        @set-active="handleSetActive"
      />
    </template>

    <el-empty v-else description="尚未建立任何配裝">
      <el-button type="primary" :icon="Plus" @click="handleAdd">
        建立第一組配裝
      </el-button>
    </el-empty>

    <GearsetEditor
      :visible="editorVisible"
      :gearset="editingGearset"
      @update:visible="editorVisible = $event"
      @save="handleSave"
    />
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
</style>
