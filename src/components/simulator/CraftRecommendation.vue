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

    <!-- Scenario A: 雙滿 (max progress + max quality) -->
    <template v-if="scenario === 'maxed'">
      <p class="scenario-status scenario-status--maxed">
        <span class="scenario-status-icon" aria-hidden="true">✓</span>
        已達雙滿，照下方採購即可
      </p>
      <el-skeleton v-if="bomLoading" :rows="4" animated />
      <BomSummary
        v-else-if="flatMaterials.length > 0"
        :materials="flatMaterials"
        :prices="prices"
        :target-item-ids="[recipe!.itemId]"
        :material-tree="bomTree"
        @refresh-prices="refreshPrices"
      />
    </template>

    <!-- Scenario B: 品質不足 (suggest HQ ingredient combos) -->
    <template v-if="scenario === 'quality-deficit'">
      <p class="scenario-status">
        品質差距 <strong>{{ achievedQuality?.toLocaleString() }}</strong>
        / {{ maxQuality?.toLocaleString() }}
        （缺 <strong>{{ qualityDeficit?.toLocaleString() }}</strong>，補幾組 HQ 素材就能補上）
      </p>
      <el-skeleton v-if="hqLoading" :rows="3" animated />
      <template v-else>
        <el-empty v-if="recommendations.length === 0" description="無法透過 HQ 素材達成品質需求" :image-size="60" />

        <el-table v-else :data="recommendations" border size="small" style="width: 100%" class="hq-rec-table">
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

        <div v-if="missingPriceIngredients.length > 0" class="self-craft-section">
          <p class="self-craft-hint">以下素材無 HQ 市場價，可考慮自製：</p>
          <div class="self-craft-btns">
            <el-button v-for="ing in missingPriceIngredients" :key="ing.itemId" size="small" @click="emit('self-craft', ing.itemId)">
              自製「<ItemName :item-id="ing.itemId" :fallback="ing.name" />」
            </el-button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.craft-recommendation {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Replaces the el-card header tag pattern. Reads inline with the section
   eyebrow rather than introducing a second nested header. */
.scenario-status {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--app-text);
}
.scenario-status strong {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 600;
  color: var(--app-craft);
}
.scenario-status--maxed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, oklch(0.62 0.17 135) 12%, transparent);
  border-radius: 8px;
  color: oklch(0.40 0.14 135);
  font-weight: 600;
  align-self: flex-start;
}
.scenario-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: oklch(0.62 0.17 135);
  color: white;
  font-size: 11px;
  font-weight: 700;
}

.hq-amount {
  color: var(--app-craft);
  font-weight: 600;
}
.nq-amount {
  color: var(--app-text-muted);
}

.self-craft-section {
  margin-top: 4px;
}
.self-craft-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.self-craft-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 640px) {
  :deep(.hq-rec-table .el-table__cell),
  :deep(.hq-rec-table .el-table__header th) {
    padding-left: 4px;
    padding-right: 4px;
    font-size: 12px;
  }
}
</style>
