<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import RecipeSearch from '@/components/recipe/RecipeSearch.vue'
import RecipeDetail from '@/components/recipe/RecipeDetail.vue'
import { getRecipe } from '@/api/xivapi'
import { useRecipeStore } from '@/stores/recipe'
import { useBomStore } from '@/stores/bom'
import type { Recipe } from '@/stores/recipe'

const router = useRouter()
const recipeStore = useRecipeStore()
const bomStore = useBomStore()

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
    router.push({ name: 'simulator' })
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
  <div class="recipe-view">
    <h2>配方搜尋</h2>
    <el-row :gutter="20" class="recipe-content">
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <span>搜尋配方</span>
          </template>
          <RecipeSearch @select="handleSelect" />
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card v-loading="detailLoading" shadow="never">
          <template #header>
            <span>配方詳情</span>
          </template>
          <RecipeDetail
            :recipe="selectedRecipe"
            @use-in-simulator="handleUseInSimulator"
            @add-to-bom="handleAddToBom"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.recipe-view {
  padding: 20px;
}

.recipe-view h2 {
  margin-top: 0;
  margin-bottom: 16px;
}

.recipe-content {
  height: calc(100vh - 140px);
}

.recipe-content .el-card {
  height: 100%;
}
</style>
