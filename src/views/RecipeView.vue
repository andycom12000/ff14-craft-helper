<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import RecipeSearch from '@/components/recipe/RecipeSearch.vue'
import RecipeDetail from '@/components/recipe/RecipeDetail.vue'
import { getRecipe } from '@/api/xivapi'
import { useRecipeStore } from '@/stores/recipe'
import { useBomStore } from '@/stores/bom'
import { useBatchStore } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'

const router = useRouter()
const recipeStore = useRecipeStore()
const bomStore = useBomStore()
const batchStore = useBatchStore()

const selectedRecipe = ref<Recipe | null>(null)
const detailLoading = ref(false)

async function handleSelect(id: number) {
  detailLoading.value = true
  try {
    const recipe = await getRecipe(id)
    selectedRecipe.value = recipe
    recipeStore.setRecipe(recipe)
  } catch {
    ElMessage.error('無法載入配方詳情，請稍後再試。')
  } finally {
    detailLoading.value = false
  }
}

function handleUseInSimulator() {
  if (selectedRecipe.value) {
    recipeStore.addToQueue(selectedRecipe.value)
    router.push({ name: 'simulator' })
  }
}

function handleAddToBatch() {
  if (selectedRecipe.value) {
    batchStore.addTarget(selectedRecipe.value)
    ElMessage.success(`已加入批量：${selectedRecipe.value.name}`)
  }
}

function handleAddToBom() {
  if (selectedRecipe.value) {
    bomStore.addTarget({
      itemId: selectedRecipe.value.itemId,
      recipeId: selectedRecipe.value.id,
      name: selectedRecipe.value.name,
      icon: selectedRecipe.value.icon,
      quantity: 1,
    })
    ElMessage.success(`已將「${selectedRecipe.value.name}」加入材料清單。`)
  }
}
</script>

<template>
  <div class="view-container">
    <h2>配方搜尋</h2>
    <p class="view-desc">搜尋並選擇配方，查看詳情後可加入模擬器或材料清單。</p>

    <el-row :gutter="20" class="recipe-content">
      <el-col :span="10" :xs="24">
        <el-card shadow="never" class="recipe-card">
          <template #header>
            <span class="card-title">搜尋配方</span>
          </template>
          <RecipeSearch @select="handleSelect" />
        </el-card>
      </el-col>
      <el-col :span="14" :xs="24" class="detail-col">
        <el-card v-loading="detailLoading" shadow="never" class="recipe-card">
          <template #header>
            <span class="card-title">配方詳情</span>
          </template>
          <RecipeDetail
            :recipe="selectedRecipe"
            @use-in-simulator="handleUseInSimulator"
            @add-to-bom="handleAddToBom"
            @add-to-batch="handleAddToBatch"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.recipe-content {
  height: calc(100vh - 160px);
}

.recipe-card {
  height: 100%;
}

@media (max-width: 768px) {
  .recipe-content {
    height: auto;
  }

  .detail-col {
    margin-top: 16px;
  }
}
</style>
