<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { runBatchOptimization } from '@/services/batch-optimizer'
import BatchList from '@/components/batch/BatchList.vue'
import BatchSettings from '@/components/batch/BatchSettings.vue'
import BatchProgress from '@/components/batch/BatchProgress.vue'
import ShoppingList from '@/components/batch/ShoppingList.vue'
import TodoList from '@/components/batch/TodoList.vue'
import ExceptionList from '@/components/batch/ExceptionList.vue'

const batchStore = useBatchStore()
const settings = useSettingsStore()
const gearsets = useGearsetsStore()

async function startOptimization() {
  if (batchStore.targets.length === 0) return

  batchStore.isRunning = true
  batchStore.isCancelled = false
  batchStore.clearResults()

  try {
    const results = await runBatchOptimization(
      batchStore.targets,
      (job) => gearsets.getGearsetForJob(job),
      {
        crossServer: settings.crossServer,
        recursivePricing: settings.recursivePricing,
        maxRecursionDepth: settings.maxRecursionDepth,
        exceptionStrategy: settings.exceptionStrategy,
        server: settings.server,
        dataCenter: settings.dataCenter,
      },
      (info) => {
        batchStore.progress = {
          current: info.current,
          total: info.total,
          currentName: info.name,
          phase: info.phase,
          solverPercent: info.solverPercent,
        }
      },
      () => batchStore.isCancelled,
    )
    batchStore.results = results
  } catch (err) {
    console.error('[BatchView] Optimization failed:', err)
  } finally {
    batchStore.isRunning = false
  }
}

function handleTodoDone(index: number, done: boolean) {
  if (batchStore.results) {
    batchStore.results.todoList[index].done = done
  }
}
</script>

<template>
  <div class="view-container">
    <h2>批量製作</h2>
    <p class="view-desc">選擇多個配方一次計算，自動產出最佳採購清單與製作順序。</p>

    <div class="batch-layout">
      <!-- Left column: always present, capped width -->
      <div class="batch-left">
        <BatchList />
        <BatchSettings />

        <div class="batch-action">
          <el-button
            type="primary"
            size="large"
            :disabled="batchStore.targets.length === 0 || batchStore.isRunning"
            @click="startOptimization"
          >
            &#9654; 開始最佳化計算
          </el-button>
        </div>

        <BatchProgress />

        <!-- Exceptions -->
        <el-card
          v-if="batchStore.results && batchStore.results.exceptions.length > 0"
          shadow="never"
          class="batch-card"
        >
          <template #header>
            <span class="card-title" style="color: var(--el-color-danger);">
              例外提示
              <el-badge :value="batchStore.results.exceptions.length" :max="99" />
            </span>
          </template>
          <ExceptionList :exceptions="batchStore.results.exceptions" />
        </el-card>

        <!-- Todo list: appears below inputs after calculation -->
        <el-card v-if="batchStore.results" shadow="never" class="batch-card">
          <template #header>
            <span class="card-title">製作待辦</span>
          </template>
          <TodoList
            :items="batchStore.results.todoList"
            @update:done="handleTodoDone"
          />
        </el-card>
      </div>

      <!-- Right column: shopping list, only after calculation -->
      <div v-if="batchStore.results" class="batch-right">
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="card-title">採購清單</span>
              <el-text size="small" type="info">點擊素材行可複製品名</el-text>
            </div>
          </template>
          <ShoppingList
            :crystals="batchStore.results.crystals"
            :server-groups="batchStore.results.serverGroups"
            :self-craft-items="batchStore.results.selfCraftItems"
            :grand-total="batchStore.results.grandTotal"
            :cross-world-cache="batchStore.results.crossWorldCache"
          />
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.batch-left {
  flex: 0 0 auto;
  width: 740px;
  min-width: 0;
}

.batch-right {
  flex: 1;
  min-width: 0;
  position: sticky;
  top: 16px;
}

.batch-action {
  text-align: center;
  padding: 20px 0;
}

.batch-card {
  margin-top: 16px;
}

@media (max-width: 1600px) {
  .batch-layout {
    flex-direction: column;
  }

  .batch-left {
    width: 100%;
  }

  .batch-right {
    position: static;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .batch-action {
    padding: 12px 0;
  }
}
</style>
