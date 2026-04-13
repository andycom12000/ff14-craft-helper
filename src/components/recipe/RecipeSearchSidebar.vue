<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Search, Close } from '@element-plus/icons-vue'
import { searchRecipes, getRecipe, type RecipeSearchResult } from '@/api/xivapi'
import type { Recipe } from '@/stores/recipe'

const CRAFT_JOBS = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'] as const

defineProps<{ modelValue: boolean; context?: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'add': [recipe: Recipe]
}>()

const query = ref('')
const allResults = ref<RecipeSearchResult[]>([])
const loading = ref(false)
const addingIds = ref(new Set<number>())
const selectedJob = ref('')
const levelMin = ref<number | undefined>(undefined)
const levelMax = ref<number | undefined>(undefined)

const filteredResults = computed(() => {
  let list = allResults.value
  if (selectedJob.value) {
    list = list.filter(r => r.job === selectedJob.value)
  }
  if (levelMin.value != null) {
    list = list.filter(r => r.level >= levelMin.value!)
  }
  if (levelMax.value != null) {
    list = list.filter(r => r.level <= levelMax.value!)
  }
  return list
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = value.trim()
  if (!trimmed) {
    allResults.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true
    try {
      allResults.value = await searchRecipes(trimmed)
    } catch {
      allResults.value = []
    } finally {
      loading.value = false
    }
  }, 500)
})

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

async function addRecipe(row: RecipeSearchResult) {
  if (addingIds.value.has(row.id)) return
  addingIds.value.add(row.id)
  try {
    const recipe = await getRecipe(row.id)
    emit('add', recipe)
  } catch {
    // parent handles messaging
  } finally {
    addingIds.value.delete(row.id)
  }
}

function close() {
  emit('update:modelValue', false)
  query.value = ''
  allResults.value = []
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="dialog-overlay" @click.self="close" @keydown.esc="close">
        <div class="dialog-panel">
          <div class="dialog-header">
            <h3 class="dialog-title">搜尋配方{{ context ? ` — ${context}` : '' }}</h3>
            <el-button :icon="Close" text @click="close" />
          </div>

          <div class="dialog-search">
            <el-input
              v-model="query"
              placeholder="搜尋配方名稱..."
              clearable
              :prefix-icon="Search"
              size="large"
            />
            <div class="dialog-filters">
              <el-select v-model="selectedJob" placeholder="職業" clearable size="small" style="width: 100px;">
                <el-option v-for="job in CRAFT_JOBS" :key="job" :label="job" :value="job" />
              </el-select>
              <span class="filter-label">Lv.</span>
              <el-input-number v-model="levelMin" :min="1" :max="999" placeholder="最低" size="small" style="width: 100px;" />
              <span class="filter-sep">–</span>
              <el-input-number v-model="levelMax" :min="1" :max="999" placeholder="最高" size="small" style="width: 100px;" />
            </div>
          </div>

          <div class="dialog-results" v-loading="loading">
            <div
              v-for="row in filteredResults"
              :key="row.id"
              class="search-result-row"
            >
              <img v-if="row.icon" :src="row.icon" :alt="row.name" class="result-icon" />
              <div class="result-info">
                <div class="result-name">{{ row.name }}</div>
                <div class="result-meta">Lv.{{ row.level }} · {{ row.job }}</div>
              </div>
              <el-button
                size="small"
                type="primary"
                :loading="addingIds.has(row.id)"
                @click="addRecipe(row)"
              >+</el-button>
            </div>
            <el-empty v-if="!loading && filteredResults.length === 0 && query.trim()" description="沒有找到配方" />
            <el-empty v-if="!loading && !query.trim()" description="輸入關鍵字搜尋配方" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-panel {
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: 72vh;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-dark);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dialog-search {
  padding: 16px 24px;
}

.dialog-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.filter-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.filter-sep {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.dialog-results {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 20px;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.search-result-row:last-child {
  border-bottom: none;
}

.result-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 14px;
  font-weight: 500;
}

.result-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* Transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.25s;
}

.dialog-enter-active .dialog-panel,
.dialog-leave-active .dialog-panel {
  transition: transform 0.25s, opacity 0.25s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-panel,
.dialog-leave-to .dialog-panel {
  transform: scale(0.95);
  opacity: 0;
}

@media (max-width: 520px) {
  .dialog-panel {
    max-height: 85vh;
  }
}
</style>
