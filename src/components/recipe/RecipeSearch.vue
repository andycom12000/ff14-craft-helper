<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { searchRecipes, type RecipeSearchResult } from '@/api/xivapi'
import ItemName from '@/components/common/ItemName.vue'
import { trackEvent } from '@/utils/analytics'

const CRAFT_JOBS = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'] as const

const emit = defineEmits<{
  select: [id: number]
}>()

const query = ref('')
const results = ref<RecipeSearchResult[]>([])
const loading = ref(false)
const selectedJob = ref('')
const levelMin = ref<number | undefined>(undefined)
const levelMax = ref<number | undefined>(undefined)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

watch(
  [query, selectedJob, levelMin, levelMax],
  ([value]) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    const trimmed = String(value).trim()
    if (!trimmed) {
      results.value = []
      return
    }

    const seq = ++searchSeq
    debounceTimer = setTimeout(async () => {
      loading.value = true
      try {
        const res = await searchRecipes(trimmed, {
          job: selectedJob.value || undefined,
          rlvMin: levelMin.value ?? undefined,
          rlvMax: levelMax.value ?? undefined,
        })
        // Drop stale responses if a newer search has been queued.
        if (seq !== searchSeq) return
        results.value = res
      } catch {
        if (seq === searchSeq) results.value = []
      } finally {
        if (seq === searchSeq) {
          loading.value = false
          trackEvent('search_query', {
            query: trimmed,
            result_count: results.value.length,
            source: 'recipe',
          })
        }
      }
    }, 200)
  },
)

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

function handleRowClick(row: RecipeSearchResult) {
  emit('select', row.id)
}
</script>

<template>
  <div class="recipe-search">
    <el-input
      v-model="query"
      placeholder="搜尋配方名稱..."
      clearable
      :prefix-icon="Search"
      size="large"
    />

    <div class="filter-row">
      <el-select v-model="selectedJob" placeholder="職業" clearable size="small" class="filter-job">
        <el-option v-for="job in CRAFT_JOBS" :key="job" :label="job" :value="job" />
      </el-select>
      <span class="filter-label">Lv.</span>
      <el-input-number v-model="levelMin" :min="1" :max="999" placeholder="最低" size="small" class="filter-level" />
      <span class="filter-sep">–</span>
      <el-input-number v-model="levelMax" :min="1" :max="999" placeholder="最高" size="small" class="filter-level" />
    </div>

    <el-skeleton
      v-if="loading && results.length === 0"
      :rows="5"
      animated
      style="margin-top: 12px"
    />
    <el-table
      v-else
      v-loading="loading"
      :data="results"
      style="width: 100%; margin-top: 12px"
      highlight-current-row
      @row-click="handleRowClick"
      empty-text="輸入關鍵字搜尋配方"
      :row-style="{ cursor: 'pointer' }"
    >
      <el-table-column label="圖示" width="60" align="center">
        <template #default="{ row }">
          <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" style="width: 32px; height: 32px" />
        </template>
      </el-table-column>
      <el-table-column label="名稱">
        <template #default="{ row }">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
        </template>
      </el-table-column>
      <el-table-column prop="level" label="配方等級" width="100" align="center" />
      <el-table-column prop="job" label="職業" width="80" align="center" />
    </el-table>
  </div>
</template>

<style scoped>
.recipe-search {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.filter-job {
  width: 100px;
}

.filter-label {
  font-size: 13px;
  color: var(--app-text-muted);
  margin-left: 4px;
}

.filter-sep {
  font-size: 13px;
  color: var(--app-text-muted);
}

.filter-level {
  width: 120px;
}
</style>
