<script setup lang="ts">
import { computed } from 'vue'
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

const hasResults = computed(() => batchStore.results !== null)
const exceptionCount = computed(() => batchStore.results?.exceptions.length ?? 0)

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
    <h2 style="margin-bottom: 24px;">批量製作</h2>

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

    <el-card v-if="hasResults" shadow="never" style="margin-top: 16px;">
      <el-tabs>
        <el-tab-pane label="採購清單">
          <ShoppingList
            :crystals="batchStore.results!.crystals"
            :server-groups="batchStore.results!.serverGroups"
            :self-craft-items="batchStore.results!.selfCraftItems"
            :grand-total="batchStore.results!.grandTotal"
          />
        </el-tab-pane>
        <el-tab-pane label="製作待辦">
          <TodoList
            :items="batchStore.results!.todoList"
            @update:done="handleTodoDone"
          />
        </el-tab-pane>
        <el-tab-pane v-if="exceptionCount > 0">
          <template #label>
            <span style="color: var(--el-color-danger);">
              例外提示
              <el-badge :value="exceptionCount" :max="99" style="margin-left: 4px;" />
            </span>
          </template>
          <ExceptionList :exceptions="batchStore.results!.exceptions" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.batch-view {
  max-width: 960px;
}
</style>
