<script setup lang="ts">
import { useBomStore, targetKey } from '@/stores/bom'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import BomTargetCard from '@/components/bom/BomTargetCard.vue'

const bomStore = useBomStore()

const emit = defineEmits<{
  calculate: []
  'open-search': []
  'open-import': []
}>()

function handleQuantityChange(key: string, val: number | undefined) {
  bomStore.updateTargetQuantity(key, val ?? 1)
}

function handleClearAll() {
  bomStore.clearTargets()
  ElMessage.info('已清除所有目標')
}
</script>

<template>
  <section class="bom-target-list">
    <header class="card-header">
      <span class="card-title">製作目標</span>
      <div class="card-actions">
        <el-button type="primary" text size="small" :icon="Search" @click="emit('open-search')">
          搜尋配方
        </el-button>
        <el-button type="primary" text size="small" :icon="Download" @click="emit('open-import')">
          匯入
        </el-button>
        <el-text type="info" size="small" class="card-count">
          {{ bomStore.targets.length }} 個目標
        </el-text>
        <el-popconfirm
          v-if="bomStore.targets.length > 0"
          title="確定要清除所有目標嗎？"
          confirm-button-text="確定"
          cancel-button-text="取消"
          @confirm="handleClearAll"
        >
          <template #reference>
            <el-button type="danger" text size="small">
              全部清除
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </header>

    <AppEmptyState
      v-if="bomStore.targets.length === 0"
      icon="◌"
      title="建立你的購物清單"
      description="加入想製作的道具，自動計算所需素材和市場價格"
    >
      <div class="empty-actions">
        <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
        <el-button :icon="Download" @click="emit('open-import')">匯入 Teamcraft</el-button>
      </div>
    </AppEmptyState>

    <!-- Card grid — column-count layout halves the vertical length when the
         list grows past a few items. Same shape as BatchList's recipe-card-list
         so the two pages read as siblings. -->
    <div v-else class="bom-target-cards">
      <BomTargetCard
        v-for="row in bomStore.targets"
        :key="targetKey(row)"
        :target="row"
        class="bom-target-cards__item"
        @update:quantity="handleQuantityChange"
        @remove="bomStore.removeTarget"
      />
    </div>
  </section>
</template>

<style scoped>
.bom-target-list {
  /* Card grid is column-driven; no container query needed. */
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 0 4px;
}

/* `.card-title` falls back to the global rule in App.vue (15px / 600). */

.card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* Column-flow grid — fills col 1 top-down then spills into col 2. Mirrors
 * BatchList's recipe-card-list so multiple cards visually balance in the
 * prepare-main column instead of stacking into a single tall list. */
.bom-target-cards {
  column-count: 1;
  column-gap: 8px;
}

.bom-target-cards__item {
  margin-bottom: 8px;
  break-inside: avoid;
}

/* ≥720 of the host column: switch to 2 columns so the list halves in
 * height once 4+ targets exist. */
@media (min-width: 900px) {
  .bom-target-cards {
    column-count: 2;
  }
}

@media (max-width: 640px) {
  .card-header {
    gap: 8px;
  }
  .card-actions {
    gap: 8px;
    width: 100%;
  }
  .card-count {
    margin-left: auto;
  }
}
</style>
