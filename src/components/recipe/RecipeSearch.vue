<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { searchRecipes, type RecipeSearchResult } from '@/api/xivapi'

const emit = defineEmits<{
  select: [id: number]
}>()

const query = ref('')
const results = ref<RecipeSearchResult[]>([])
const loading = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (value) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    results.value = []
    return
  }

  debounceTimer = setTimeout(async () => {
    loading.value = true
    try {
      results.value = await searchRecipes(trimmed)
    } catch {
      results.value = []
    } finally {
      loading.value = false
    }
  }, 500)
})

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

    <el-table
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
          <img :src="row.icon" :alt="row.name" style="width: 32px; height: 32px" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名稱" />
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
</style>
