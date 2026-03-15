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
  <div class="batch-layout">
    <!-- Left column: batch list + settings + action + shopping list -->
    <div class="batch-main">
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

      <template v-if="batchStore.results">
        <!-- Exception banner -->
        <el-card
          v-if="batchStore.results.exceptions.length > 0"
          shadow="never"
          style="margin-top: 16px;"
        >
          <template #header>
            <span style="color: var(--el-color-danger);">
              例外提示
              <el-badge :value="batchStore.results.exceptions.length" :max="99" style="margin-left: 4px;" />
            </span>
          </template>
          <ExceptionList :exceptions="batchStore.results.exceptions" />
        </el-card>

        <!-- Shopping list -->
        <el-card shadow="never" style="margin-top: 16px;">
          <template #header>採購清單</template>
          <ShoppingList
            :crystals="batchStore.results.crystals"
            :server-groups="batchStore.results.serverGroups"
            :self-craft-items="batchStore.results.selfCraftItems"
            :grand-total="batchStore.results.grandTotal"
          />
        </el-card>
      </template>
    </div>

    <!-- Right column: todo list (sticky on wide screens) -->
    <div v-if="batchStore.results" class="batch-aside">
      <el-card shadow="never" class="todo-card">
        <template #header>製作待辦</template>
        <TodoList
          :items="batchStore.results.todoList"
          @update:done="handleTodoDone"
        />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.batch-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.batch-main {
  flex: 1;
  min-width: 0;
  max-width: 720px;
}

.batch-aside {
  flex: 0 0 380px;
  position: sticky;
  top: 16px;
}

.batch-title {
  margin-bottom: 24px;
}

.todo-card {
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

/* When no results yet, main takes full width */
.batch-layout:not(:has(.batch-aside)) .batch-main {
  max-width: 960px;
}

/* Stacked on narrow screens */
@media (max-width: 1100px) {
  .batch-layout {
    flex-direction: column;
  }

  .batch-main {
    max-width: none;
  }

  .batch-aside {
    flex: none;
    width: 100%;
    position: static;
  }

  .todo-card {
    max-height: none;
  }
}

@media (max-width: 768px) {
  .batch-title {
    font-size: 18px;
    margin-bottom: 16px;
  }
}
</style>
