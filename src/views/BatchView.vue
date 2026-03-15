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
  <div class="batch-view">
    <h2 class="batch-title">批量製作</h2>

    <BatchList />
    <BatchSettings style="margin-top: 16px;" />

    <div style="text-align: center; margin: 20px 0;">
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

    <!-- Results: split layout on wide screens -->
    <template v-if="batchStore.results">
      <!-- Exception banner (full width, above split) -->
      <el-card
        v-if="batchStore.results.exceptions.length > 0"
        shadow="never"
        class="results-exceptions"
      >
        <template #header>
          <span style="color: var(--el-color-danger);">
            例外提示
            <el-badge :value="batchStore.results.exceptions.length" :max="99" style="margin-left: 4px;" />
          </span>
        </template>
        <ExceptionList :exceptions="batchStore.results.exceptions" />
      </el-card>

      <div class="results-split">
        <!-- Left: Shopping List -->
        <el-card shadow="never" class="results-panel">
          <template #header>採購清單</template>
          <ShoppingList
            :crystals="batchStore.results.crystals"
            :server-groups="batchStore.results.serverGroups"
            :self-craft-items="batchStore.results.selfCraftItems"
            :grand-total="batchStore.results.grandTotal"
          />
        </el-card>

        <!-- Right: Todo List -->
        <el-card shadow="never" class="results-panel">
          <template #header>製作待辦</template>
          <TodoList
            :items="batchStore.results.todoList"
            @update:done="handleTodoDone"
          />
        </el-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.batch-view {
  max-width: 1400px;
}

.batch-title {
  margin-bottom: 24px;
}

.results-exceptions {
  margin-top: 16px;
}

.results-split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 16px;
}

.results-panel {
  min-width: 0;
}

/* Wide screen: side by side */
@media (min-width: 1200px) {
  .results-split {
    grid-template-columns: 1fr 1fr;
  }
}

/* Medium screen: stacked */
@media (max-width: 768px) {
  .batch-title {
    font-size: 18px;
    margin-bottom: 16px;
  }
}
</style>
