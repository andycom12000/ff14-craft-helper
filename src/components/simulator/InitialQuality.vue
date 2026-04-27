<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRecipeStore } from '@/stores/recipe'
import { calculateInitialQuality } from '@/engine/quality'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{
  /* External HQ amounts (e.g. from CraftRecommendation "套用" button).
     When provided, internal state syncs to it; emits stay one-way out so
     the parent can choose v-model wiring or one-shot pushes. */
  hqAmounts?: number[] | null
}>()

const emit = defineEmits<{
  'update:initialQuality': [value: number]
  'update:hqAmounts': [value: number[]]
}>()

const recipeStore = useRecipeStore()
const recipe = computed(() => recipeStore.currentRecipe)

// Track HQ amounts for each ingredient by index
const hqAmounts = ref<number[]>([])

// Reset HQ amounts when recipe changes
watch(
  () => recipe.value,
  (newRecipe) => {
    if (newRecipe) {
      hqAmounts.value = newRecipe.ingredients.map(() => 0)
    } else {
      hqAmounts.value = []
    }
  },
  { immediate: true },
)

// Sync from external prop (e.g. apply-hq from recommendations table).
watch(
  () => props.hqAmounts,
  (next) => {
    if (!next || !recipe.value) return
    if (next.length !== recipe.value.ingredients.length) return
    if (next.every((v, i) => v === hqAmounts.value[i])) return
    hqAmounts.value = [...next]
  },
)

// Emit upward whenever internal state shifts so the parent can persist it
// (used to round-trip across apply-hq → re-solve).
watch(hqAmounts, (val) => {
  emit('update:hqAmounts', [...val])
}, { deep: true })

const initialQuality = computed(() => {
  if (!recipe.value) return 0

  const ingredients = recipe.value.ingredients.map((ing, i) => ({
    amount: ing.amount,
    hqAmount: hqAmounts.value[i] ?? 0,
    level: ing.level,
    canHq: ing.canHq,
  }))

  return calculateInitialQuality(
    recipe.value.recipeLevelTable.quality,
    recipe.value.materialQualityFactor,
    ingredients,
  )
})

// Emit whenever quality changes
watch(initialQuality, (val) => {
  emit('update:initialQuality', val)
}, { immediate: true })


function setAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map((ing) => ing.canHq ? ing.amount : 0)
}

function clearAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map(() => 0)
}

function incrementHq(index: number) {
  if (!recipe.value) return
  const ing = recipe.value.ingredients[index]
  if (!ing.canHq) return
  const current = hqAmounts.value[index] ?? 0
  if (current < ing.amount) {
    hqAmounts.value[index] = current + 1
  }
}

function decrementHq(index: number) {
  const current = hqAmounts.value[index] ?? 0
  if (current > 0) {
    hqAmounts.value[index] = current - 1
  }
}
</script>

<template>
  <div class="initial-quality">
    <el-empty v-if="!recipe" description="尚未選擇配方" />

    <template v-else>
      <div class="ingredient-header">
        <h4 style="margin: 0">HQ 素材設定</h4>
        <div class="header-actions">
          <el-button size="small" @click="setAllHq">全部 HQ</el-button>
          <el-button size="small" @click="clearAllHq">全部清除</el-button>
        </div>
      </div>

      <div class="ingredient-list">
        <div
          v-for="(ing, index) in recipe.ingredients"
          :key="index"
          class="ingredient-row"
          :class="{ disabled: !ing.canHq }"
        >
          <div class="ingredient-info">
            <img :src="ing.icon" :alt="ing.name" crossorigin="anonymous" loading="lazy" decoding="async" class="ingredient-icon" />
            <span class="ingredient-name">
              <ItemName :item-id="ing.itemId" :fallback="ing.name" />
            </span>
          </div>
          <div class="ingredient-controls">
            <template v-if="ing.canHq">
              <el-button-group>
                <el-button
                  :disabled="(hqAmounts[index] ?? 0) <= 0"
                  @click="decrementHq(index)"
                  class="hq-btn nq-btn"
                >
                  NQ {{ ing.amount - (hqAmounts[index] ?? 0) }}
                </el-button>
                <el-button
                  type="primary"
                  :disabled="(hqAmounts[index] ?? 0) >= ing.amount"
                  @click="incrementHq(index)"
                  class="hq-btn"
                >
                  HQ {{ hqAmounts[index] ?? 0 }}
                </el-button>
              </el-button-group>
            </template>
            <template v-else>
              <el-button disabled class="hq-btn nq-only-btn">
                NQ {{ ing.amount }}
              </el-button>
            </template>
          </div>
        </div>
      </div>

      <div class="info-text">
        <el-text type="info" size="small">
          品質因子：{{ recipe.materialQualityFactor }}%
          ｜品質上限：{{ recipe.recipeLevelTable.quality.toLocaleString() }}
        </el-text>
      </div>
    </template>
  </div>
</template>

<style scoped>
.initial-quality {
  padding: 4px 0;
  max-width: 600px;
}

.ingredient-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.ingredient-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.ingredient-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.ingredient-row.disabled {
  opacity: 0.55;
}

.ingredient-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ingredient-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.ingredient-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ingredient-controls {
  flex-shrink: 0;
}

.hq-btn {
  min-width: 80px;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  height: 38px;
}

.nq-only-btn {
  min-width: 100px;
}

.info-text {
  margin-top: 12px;
  text-align: right;
}

@media (max-width: 640px) {
  .initial-quality {
    max-width: none;
    padding: 0;
  }

  .ingredient-header {
    margin-bottom: 4px;
  }

  .ingredient-header h4 {
    font-size: 13px;
    color: var(--app-text-muted, var(--el-text-color-secondary));
    font-weight: 600;
  }

  .ingredient-list {
    gap: 0;
    margin-top: 8px;
  }

  .ingredient-row {
    flex-direction: row;
    align-items: center;
    padding: 8px 0;
    background: transparent;
    border-radius: 0;
    border-bottom: 1px solid var(--app-border, var(--el-border-color-lighter));
    gap: 10px;
  }

  .ingredient-row:last-child {
    border-bottom: 0;
  }

  .ingredient-info {
    flex: 1;
    min-width: 0;
  }

  .ingredient-icon {
    width: 26px;
    height: 26px;
  }

  .ingredient-name {
    font-size: 13px;
  }

  .ingredient-controls {
    flex-shrink: 0;
  }

  .hq-btn {
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    height: 32px;
  }

  .nq-only-btn {
    min-width: 72px;
  }

  .info-text {
    margin-top: 10px;
    font-size: 11px;
  }
}
</style>
