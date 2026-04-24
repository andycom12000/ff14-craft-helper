<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CraftParams } from '@/engine/simulator'
import type { Recipe } from '@/stores/recipe'
import { useSettingsStore } from '@/stores/settings'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getAggregatedPrices } from '@/api/universalis'
import { findOptimalHqCombinations, type HqRecommendation } from '@/services/hq-optimizer'
import type { FlatMaterial, PriceInfo, MaterialNode } from '@/stores/bom'
import type { BomTarget } from '@/stores/bom'
import BomSummary from '@/components/bom/BomSummary.vue'
import ItemName from '@/components/common/ItemName.vue'
import { formatGil } from '@/utils/format'
import { simulateCraft, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig } from '@/solver/config'

const props = defineProps<{
  craftParams: CraftParams | null
  recipe: Recipe | null
  solverResult: { actions: string[] } | null
}>()

const emit = defineEmits<{
  'apply-hq': [hqAmounts: number[]]
  'self-craft': [recipeId: number]
}>()

const settingsStore = useSettingsStore()
const analyzed = ref(false)
const isMaxProgress = ref(false)
const isMaxQuality = ref(false)
const achievedQuality = ref(0)
const maxQuality = ref(0)
const qualityDeficit = ref(0)

const scenario = computed(() => {
  if (!analyzed.value || !isMaxProgress.value) return null
  return isMaxQuality.value ? 'maxed' : 'quality-deficit'
})

// Scenario A state
const bomLoading = ref(false)
const flatMaterials = ref<FlatMaterial[]>([])
const bomTree = ref<MaterialNode[]>([])
const prices = ref<Map<number, PriceInfo>>(new Map())

// Scenario B state
const hqLoading = ref(false)
const recommendations = ref<HqRecommendation[]>([])

const canHqIngredients = computed(() => {
  if (!props.recipe) return []
  return props.recipe.ingredients
    .map((ing, index) => ({ ...ing, index }))
    .filter(ing => ing.canHq)
})

const missingPriceIngredients = computed(() => {
  if (!props.recipe) return []
  const indices = new Set(recommendations.value.flatMap(r => r.missingPriceIndices))
  return [...indices].map(i => props.recipe!.ingredients[i])
})

watch(() => props.solverResult, async (result) => {
  if (!result || !props.craftParams || !props.recipe) {
    analyzed.value = false
    return
  }

  try {
    // Use WASM simulation for analysis
    await waitForWasm()
    const config = craftParamsToSolverConfig(props.craftParams)
    const simResult = await simulateCraft(config, result.actions)

    const effectiveQuality = simResult.quality + config.initial_quality
    isMaxProgress.value = simResult.progress >= simResult.max_progress
    isMaxQuality.value = effectiveQuality >= simResult.max_quality
    achievedQuality.value = effectiveQuality
    maxQuality.value = simResult.max_quality
    qualityDeficit.value = simResult.max_quality - effectiveQuality
    analyzed.value = true

    if (isMaxProgress.value && isMaxQuality.value) {
      await loadBom()
    } else if (isMaxProgress.value && !isMaxQuality.value) {
      await loadHqRecommendations()
    }
  } catch (err) {
    console.error('[CraftRecommendation] WASM simulation failed:', err)
    analyzed.value = false
  }
}, { immediate: true })

async function loadBom() {
  bomLoading.value = true
  flatMaterials.value = []
  bomTree.value = []
  prices.value = new Map()

  try {
    const recipe = props.recipe!
    const targets: BomTarget[] = [{
      itemId: recipe.itemId,
      recipeId: recipe.id,
      name: recipe.name,
      icon: recipe.icon,
      quantity: 1,
    }]
    const tree = await buildMaterialTree(targets)
    bomTree.value = tree
    const flat = flattenMaterialTree(tree)
    flatMaterials.value = flat

    const itemIds = flat.map(m => m.itemId)
    if (itemIds.length > 0) {
      const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
      const priceMap = new Map<number, PriceInfo>()
      for (const [id, data] of marketData) {
        priceMap.set(id, {
          itemId: id,
          minPrice: data.minPriceNQ,
          avgPrice: data.currentAveragePriceNQ,
          hqMinPrice: data.minPriceHQ,
          hqAvgPrice: data.currentAveragePriceHQ,
          lastUpdated: data.lastUploadTime,
        })
      }
      prices.value = priceMap
    }
  } catch (err) {
    console.error('[CraftRecommendation] BOM loading failed:', err)
    ElMessage.error('材料計算失敗')
  } finally {
    bomLoading.value = false
  }
}

async function refreshPrices() {
  const itemIds = flatMaterials.value.map(m => m.itemId)
  if (itemIds.length === 0) return
  try {
    const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
    const priceMap = new Map<number, PriceInfo>()
    for (const [id, data] of marketData) {
      priceMap.set(id, {
        itemId: id,
        minPrice: data.minPriceNQ,
        avgPrice: data.currentAveragePriceNQ,
        hqMinPrice: data.minPriceHQ,
        hqAvgPrice: data.currentAveragePriceHQ,
        lastUpdated: data.lastUploadTime,
      })
    }
    prices.value = priceMap
  } catch {
    ElMessage.error('價格更新失敗')
  }
}

async function loadHqRecommendations() {
  hqLoading.value = true
  recommendations.value = []

  try {
    const recipe = props.recipe!
    const canHqItems = recipe.ingredients.filter(ing => ing.canHq)
    const itemIds = canHqItems.map(ing => ing.itemId)

    // Fetch HQ prices
    const hqPriceMap = new Map<number, number>()
    if (itemIds.length > 0) {
      const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
      for (const [id, data] of marketData) {
        hqPriceMap.set(id, data.minPriceHQ)
      }
    }

    recommendations.value = findOptimalHqCombinations(
      maxQuality.value,
      recipe.materialQualityFactor,
      recipe.ingredients,
      qualityDeficit.value,
      hqPriceMap,
    )
  } catch (err) {
    console.error('[CraftRecommendation] HQ optimization failed:', err)
    ElMessage.error('HQ 最佳化失敗')
  } finally {
    hqLoading.value = false
  }
}

</script>

<template>
  <div v-if="solverResult && craftParams && recipe" class="craft-recommendation">
    <!-- Warning: progress not maxed -->
    <el-alert v-if="analyzed && !isMaxProgress" title="進度未滿，建議提升裝備數值或調整技能" type="warning" :closable="false" show-icon style="margin-top: 12px" />

    <!-- Scenario A: 雙滿 -->
    <el-card v-if="scenario === 'maxed'" shadow="never" class="rec-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">材料與成本</span>
          <el-tag type="success" size="small">雙滿</el-tag>
        </div>
      </template>
      <div v-if="bomLoading">
        <el-skeleton :rows="4" animated />
      </div>
      <BomSummary v-else-if="flatMaterials.length > 0" :materials="flatMaterials" :prices="prices" :target-item-ids="[recipe!.itemId]" :material-tree="bomTree" @refresh-prices="refreshPrices" />
    </el-card>

    <!-- Scenario B: 品質不足 -->
    <el-card v-if="scenario === 'quality-deficit'" shadow="never" class="rec-card">
      <template #header>
        <span class="card-title">HQ 材料推薦</span>
      </template>
      <div v-if="hqLoading">
        <el-skeleton :rows="3" animated />
      </div>
      <template v-else>
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
          <template #title>
            品質差距：{{ achievedQuality?.toLocaleString() }} / {{ maxQuality?.toLocaleString() }}（缺少 {{ qualityDeficit?.toLocaleString() }}）
          </template>
        </el-alert>

        <el-empty v-if="recommendations.length === 0" description="無法透過 HQ 素材達成品質需求" :image-size="60" />

        <el-table v-else :data="recommendations" border size="small" style="width: 100%" class="hq-rec-table">
          <!-- One column per canHq ingredient -->
          <el-table-column v-for="ing in canHqIngredients" :key="ing.index" :label="ing.name" align="center" min-width="80">
            <template #default="{ row }">
              <span v-if="row.hqAmounts[ing.index] > 0" class="hq-amount">HQ {{ row.hqAmounts[ing.index] }}</span>
              <span v-else class="nq-amount">-</span>
            </template>
          </el-table-column>
          <el-table-column label="成本" align="right" width="120">
            <template #default="{ row }">
              <template v-if="row.totalCost === Infinity">
                <el-tag type="warning" size="small">需自行製作</el-tag>
              </template>
              <template v-else>
                {{ formatGil(row.totalCost) }}
              </template>
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" width="100">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="emit('apply-hq', row.hqAmounts)">套用</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- Self-craft buttons for missing prices -->
        <div v-if="missingPriceIngredients.length > 0" class="self-craft-section">
          <el-text type="info" size="small">以下素材無 HQ 市場價格，可能需自行製作：</el-text>
          <div class="self-craft-btns">
            <el-button v-for="ing in missingPriceIngredients" :key="ing.itemId" size="small" @click="emit('self-craft', ing.itemId)">
              自行製作「<ItemName :item-id="ing.itemId" :fallback="ing.name" />」
            </el-button>
          </div>
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
/* Mobile: tighten the HQ-recommendation table only — the rule used
 * to target \`:deep(.el-table)\` globally, which leaked into the nested
 * BomSummary tables and hid their 小計 column (leaving empty colgroup
 * cells on the right). Scope to .hq-rec-table to keep BomSummary intact. */
@media (max-width: 640px) {
  :deep(.hq-rec-table .el-table__cell),
  :deep(.hq-rec-table .el-table__header th) {
    padding-left: 4px;
    padding-right: 4px;
    font-size: 12px;
  }
}

.rec-card {
  margin-top: 12px;
}

/* Mobile: drop the wrapper el-card chrome so BomSummary's own mobile
 * card layout reads as part of the flat SimulatorView section instead
 * of a card-inside-card-inside-accordion stack. */
@media (max-width: 640px) {
  .rec-card {
    margin-top: 0;
  }
  :deep(.rec-card.el-card),
  :deep(.rec-card .el-card__header),
  :deep(.rec-card .el-card__body) {
    background: transparent;
    border: 0;
    padding: 0;
  }
  :deep(.rec-card .el-card__header) {
    margin-bottom: 10px;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hq-amount {
  color: var(--accent-gold);
  font-weight: 600;
}

.nq-amount {
  color: var(--el-text-color-placeholder);
}

.self-craft-section {
  margin-top: 12px;
}

.self-craft-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
</style>
